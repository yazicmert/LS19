// Kalkış bulutu: alev çukurundan yanlara yayılan duman/buhar, rampa çevresinde su püskürtme buharı ve alçakta roketin bıraktığı egzoz sütunu.
// Tek çizim çağrılı, kameraya dönük örneklenmiş dörtgenler (InstancedBufferGeometry + ShaderMaterial, logaritmik derinlik uyumlu).
// Parçacıklar rampa çerçevesinde (metre; x doğu, y yukarı, z güney) yaşar: Dünya'nın dönüşüyle rampa grubu birlikte taşınır.
// Ölçek: Saturn V/SLS kalkışında bulut ~300–500 m yayılır; sütun alçakta (≲ 3 km) belirgindir. Renk: Güneş yüksekliğine göre gri-beyaz, aleve yakın turuncu.
// Değerlendirilen kütüphane: three.quarks (MIT) — genel amaçlı, ~200 KB; bu tek etki için gerekmedi (aynı teknik: örneklenmiş dörtgen, CPU benzetimi).
import * as THREE from 'three';

const N = 2400;
let puffTex = null;
function puffTexture() {
  if (puffTex) return puffTex;
  // kabarık duman dokusu: değer gürültüsünden fBm ile aşındırılmış yuvarlak (karnabahar kenarlı); alfa = örtü, kırmızı kanal = iç ayrıntı (kabartı ışığı/gölgesi)
  const S = 192, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  const img = g.createImageData(S, S); let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const G = 32, lat = new Float32Array(G * G); for (let i = 0; i < G * G; i++) lat[i] = rnd();
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), at = (i, j) => lat[((j % G + G) % G) * G + ((i % G + G) % G)];
    return (at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx) * (1 - sy) + (at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx) * sy; };
  const fbm = (x, y) => vn(x, y) * 0.5 + vn(x * 2.03 + 7, y * 2.03 + 3) * 0.27 + vn(x * 4.1 + 13, y * 4.1 + 5) * 0.15 + vn(x * 8.3 + 1, y * 8.3 + 9) * 0.08;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, r = Math.hypot(u - 0.5, v - 0.5) * 2, n = fbm(u * 5, v * 5), d = fbm(u * 9 + 20, v * 9 + 40);
    const a = Math.max(0, Math.min(1, (1 - r - (0.62 - n) * 0.9) * 3.2)) * Math.max(0, 1 - r) ** 0.35;        // kenar gürültüyle aşınır
    const k = (y * S + x) * 4; img.data[k] = Math.round(255 * Math.max(0, Math.min(1, 0.5 + (d - 0.5) * 1.9))); img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  puffTex = new THREE.CanvasTexture(cv); return puffTex;
}

const VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 iPos; attribute vec4 iCol; attribute vec3 iSz;
uniform float kScale; varying vec2 vUv; varying vec4 vCol; varying vec2 vQ; varying float vAdd;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSz.y), s = sin(iSz.y); vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
  mv.xy += p * iSz.x * kScale; vUv = position.xy + 0.5; vCol = iCol; vQ = p * 2.0; vAdd = iSz.z;          // vQ: görüş uzayında dörtgen içi konum (gölgeleme için)
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
// hacim izlenimi: dörtgen kameraya dönük bir küre gibi gölgelenir — Güneş'e bakan yüz aydınlık, karşı yüz ve alt kısım gölgede (gündüz belirgin);
// aleve yakın sıcak parçacıklar (vCol'da turuncu) kendi ışığıyla parlar, gölgelenmez
// Ateş parçacıkları (vAdd = 1: alevin yere çarpıp yayılan kısmı) toplamalı karışır, duman (vAdd = 0) normal saydam: tek çizimde ön çarpılmış alfa ile
// (çıktı rgb·a, alfa·(1 − vAdd)). Dokunun kırmızı kanalı kabartı ayrıntısıdır: aydınlık yüzde parlak, gölgede koyu girintiler.
const FS = /* glsl */`
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; uniform vec3 sunV; uniform float shade; varying vec2 vUv; varying vec4 vCol; varying vec2 vQ; varying float vAdd;
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = texture2D(map, vUv); float a = t.a * vCol.a; if (a < 0.004) discard;
  vec2 q = vQ; vec3 n = normalize(vec3(q + (t.r - 0.5) * 0.9, sqrt(max(0.0, 1.0 - dot(q, q))) + 0.35));
  float warm = clamp((vCol.r - vCol.b) * 1.5, 0.0, 1.0), lam = 0.46 + 0.6 * dot(n, sunV) - 0.14 * (1.0 - q.y);
  lam *= 0.62 + 0.76 * t.r;                                                    // kabartı: girintiler belirgin koyu
  vec3 col = vCol.rgb * mix(1.0, mix(lam, 1.0, warm * 0.7), shade * (1.0 - vAdd));
  col *= mix(1.0, 0.55 + 0.9 * t.r, vAdd);                                     // ateşte doku alev dilleri gibi
  gl_FragColor = vec4(col * a, a * (1.0 - vAdd));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class LaunchSmoke {
  // parent: rampa grubu (ölçek KM, birim metre) · kScale: KM · scale: roket büyüklüğüne göre bulut ölçeği (Saturn V/SLS 1, küçükler ~0,6)
  constructor(parent, kScale, { scale = 1, trenchDir = [0, 0, 1] } = {}) {
    const base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); this.aSz = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    for (const a of [this.aPos, this.aCol, this.aSz]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iSz', this.aSz); g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({ uniforms: { map: { value: puffTexture() }, kScale: { value: kScale }, sunV: { value: new THREE.Vector3(0, 1, 0) }, shade: { value: 0 } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });   // ön çarpılmış alfa
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; parent.add(this.mesh);
    this.sunW = new THREE.Vector3(0, 1, 0);
    this.mesh.onBeforeRender = (r, sc, cam) => { m.uniforms.sunV.value.copy(this.sunW).transformDirection(cam.matrixWorldInverse); };   // Güneş yönü görüş uzayında
    this.p = []; this.scale = scale; this.td = trenchDir; this.acc = { trench: 0, deluge: 0, column: 0, fire: 0 }; this.seed = 11; this.lastMet = null;
  }
  rnd() { return (this.seed = (this.seed * 16807) % 2147483647) / 2147483647; }
  // tone: duman tonu (1 beyaz buhar, < 1 gri is) · fire: 1 = toplamalı ateş parçacığı
  spawn(x, y, z, vx, vy, vz, size, grow, life, alpha, heat, tone = 1, fire = 0) {
    if (this.p.length >= N) this.p.shift();
    this.p.push({ x, y, z, vx, vy, vz, s: size, g: grow, life, age: 0, a: alpha, heat, tone, fire, rot: this.rnd() * 6.283, w: (this.rnd() - 0.5) * 0.3 });
  }
  // met: gerçek uçuş saniyesi · dt: gerçek uçuş saniyesi (hız çarpanıyla) · rocket: roket tabanı rampa çerçevesinde (m) · thr · sunUp · cam: kamera rampa çerçevesinde (m)
  update(met, dt, { rocket, thr, sunUp, cam, sunDir }) {
    if (sunDir) this.sunW.set(sunDir[0], sunDir[1], sunDir[2]);
    const S = this.scale, R = () => this.rnd(), td = this.td;
    dt = Math.min(dt, 2);
    if (dt > 0) {
      // su püskürtme buharı: T−8 s'den kalkışa dek rampa çevresinde, sonra azalarak
      if (met > -8 && met < 18) { this.acc.deluge += dt * (met < 0 ? 10 : 18 * Math.exp(-met / 8)); while (this.acc.deluge >= 1) { this.acc.deluge--;
        const a = R() * 6.283, r = (20 + R() * 25) * S; this.spawn(Math.cos(a) * r, 2 + R() * 6, Math.sin(a) * r, Math.cos(a) * 3, 3 + R() * 3, Math.sin(a) * 3, 18 * S, 7 * S, 14 + R() * 8, 0.2, 0); } }
      // alev çukuru: ateşlemeden (T−0) itibaren iki yöne fışkıran sıcak duman, roket yükseldikçe söner
      const hR = rocket ? rocket[1] : 0;
      if (met > -1 && thr > 0 && hR < 600) { this.acc.trench += dt * 60 * Math.exp(-hR / 220); while (this.acc.trench >= 1) { this.acc.trench--;
        const sgn = R() < 0.7 ? 1 : -1, sp = (50 + R() * 40) * S, sx = (R() - 0.5) * 0.5;
        this.spawn(td[0] * 30 * S * sgn, 4, td[2] * 30 * S * sgn, (td[0] * sgn + sx * td[2]) * sp, 4 + R() * 8, (td[2] * sgn + sx * td[0]) * sp, 22 * S, 12 * S, 22 + R() * 14, 0.4, 1, 0.7 + R() * 0.25); } }
      // alevin yere çarpması: roket rampadan yeni ayrılmışken (taban 90 m'nin altında) alev zeminde her yöne ve hendek boyunca yayılır — parlak, kısa ömürlü ateş dilleri
      if (rocket && met > -0.6 && thr > 0 && hR < 90) { this.acc.fire += dt * 170 * (1 - hR / 90) * (met < 0 ? 0.5 : 1); while (this.acc.fire >= 1) { this.acc.fire--;
        const a = R() * 6.283, along = R() < 0.55, dx = along ? td[0] * (R() < 0.7 ? 1 : -1) + (R() - 0.5) * 0.35 : Math.cos(a), dz = along ? td[2] * (R() < 0.7 ? 1 : -1) + (R() - 0.5) * 0.35 : Math.sin(a), sp = (28 + R() * 55) * S;
        this.spawn(rocket[0] + dx * 4 * S, 1.5 + R() * 3, rocket[2] + dz * 4 * S, dx * sp, 2 + R() * 9, dz * sp, (9 + R() * 8) * S, 20 * S, 0.6 + R() * 0.7, 0.9, 1, 1, 1); } }
      // egzoz sütunu: roketin bıraktığı iz (alçakta yoğun; 3 km üstünde incelir). Parçacıklar bu karede roketin aldığı yol boyunca (önceki → şimdiki taban)
      // dağıtılır ve doğdukları ana göre yaşlandırılır: düşük kare hızında ya da hızlandırılmış zamanda iz kesik kesik (boncuk dizisi) olmaz
      const prev = this.lastRocket && met > this.lastColMet ? this.lastRocket : rocket;
      if (rocket && thr > 0 && met > 0 && hR < 6000) { this.acc.column += dt * 26 * Math.exp(-hR / 2500) * Math.max(1, Math.hypot(rocket[0] - prev[0], rocket[1] - prev[1], rocket[2] - prev[2]) / (12 * S) / Math.max(1, dt * 26)); this.acc.column = Math.min(this.acc.column, 300); while (this.acc.column >= 1) { this.acc.column--;   // kare başına üst sınır (hızlandırılmış zamanda)
        const u = R(), x = prev[0] + (rocket[0] - prev[0]) * u, y = prev[1] + (rocket[1] - prev[1]) * u, z = prev[2] + (rocket[2] - prev[2]) * u;
        this.spawn(x + (R() - 0.5) * 6 * S, y - 20 * S, z + (R() - 0.5) * 6 * S, (R() - 0.5) * 4, -6 - R() * 6, (R() - 0.5) * 4, 16 * S, 6 * S, 30 + R() * 20, 0.38, 0.25, 0.84 + R() * 0.16);
        this.p[this.p.length - 1].age = (1 - u) * dt; } }
      if (rocket) { this.lastRocket = rocket.slice(); this.lastColMet = met; }
      for (const q of this.p) {
        const drag = Math.exp(-dt / 3.5); q.vx *= drag; q.vz *= drag; q.vy = q.vy * drag + dt * 1.2;            // yavaşlar, ısıyla hafif yükselir
        q.x += q.vx * dt; q.y = Math.max(q.y + q.vy * dt, q.s * 0.25); q.z += q.vz * dt;
        q.s += q.g * dt * Math.exp(-q.age / 12); q.age += dt; q.rot += q.w * dt; q.heat *= Math.exp(-dt / 2.5);
      }
      this.p = this.p.filter((q) => q.age < q.life);
    }
    // uzaktan yakına sıralı (saydam karışım doğru üst üste binsin); ateş dumanın üstüne çizilir (ışık saçar: önündeki ince dumandan parlar)
    if (cam) { for (const q of this.p) q.d = ((q.x - cam[0]) ** 2 + (q.y - cam[1]) ** 2 + (q.z - cam[2]) ** 2) * (q.fire ? 0.2 : 1); this.p.sort((a, b) => b.d - a.d); }
    const day = Math.max(0, Math.min(1, (sunUp + 0.1) / 0.4)), amb = 0.12 + 0.5 * day, P = this.aPos.array, C = this.aCol.array, Z = this.aSz.array;
    this.mesh.material.uniforms.shade.value = 0.85 * day;
    let n = 0;
    for (const q of this.p) {
      const f = q.age / q.life, al = q.a * Math.min(1, q.age * 1.5) * (1 - f) ** 1.3;
      const near = rocket && thr > 0 ? thr * Math.exp(-Math.hypot(q.x - rocket[0], q.y - rocket[1], q.z - rocket[2]) / 45) : 0, hot = Math.min(1, q.heat * 0.3 + near * 0.8);
      P[n * 3] = q.x; P[n * 3 + 1] = q.y; P[n * 3 + 2] = q.z;
      if (q.fire) {                                                    // ateş: sarı-beyaz çekirdekten turuncuya, sonra koyu kırmızıya; hızla söner
        const k = 1 - f; C[n * 4] = 2.6 * k + 0.5; C[n * 4 + 1] = 1.9 * k * k + 0.12; C[n * 4 + 2] = 1.1 * k * k * k; C[n * 4 + 3] = q.a * Math.min(1, q.age * 14) * k;
      } else {                                                         // duman: tonlu gri-beyaz; aleve yakınken turuncuya KARIŞIR (toplanıp beyaza doymaz)
        const b0 = amb * q.tone, w = Math.min(0.85, hot * 0.95);
        C[n * 4] = b0 * 0.95 * (1 - w) + 1.25 * w; C[n * 4 + 1] = b0 * 0.95 * (1 - w) + 0.62 * w; C[n * 4 + 2] = b0 * (1 - w) + 0.22 * w; C[n * 4 + 3] = al;
      }
      Z[n * 3] = q.s; Z[n * 3 + 1] = q.rot; Z[n * 3 + 2] = q.fire ? 1 : 0; n++;
    }
    this.mesh.geometry.instanceCount = n;
    for (const a of [this.aPos, this.aCol, this.aSz]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
    this.count = n;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); if (this.mesh.parent) this.mesh.parent.remove(this.mesh); }
}
