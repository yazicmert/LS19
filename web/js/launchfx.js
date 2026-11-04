// Kalkış bulutu: alev çukurundan yanlara yayılan duman/buhar, rampa çevresinde su püskürtme buharı ve alçakta roketin bıraktığı egzoz sütunu.
// Tek çizim çağrılı, kameraya dönük örneklenmiş dörtgenler (InstancedBufferGeometry + ShaderMaterial, logaritmik derinlik uyumlu).
// Parçacıklar rampa çerçevesinde (metre; x doğu, y yukarı, z güney) yaşar: Dünya'nın dönüşüyle rampa grubu birlikte taşınır.
// Ölçek: Saturn V/SLS kalkışında bulut ~300–500 m yayılır; sütun alçakta (≲ 3 km) belirgindir. Renk: Güneş yüksekliğine göre gri-beyaz, aleve yakın turuncu.
// Değerlendirilen kütüphane: three.quarks (MIT) — genel amaçlı, ~200 KB; bu tek etki için gerekmedi (aynı teknik: örneklenmiş dörtgen, CPU benzetimi).
import * as THREE from 'three';

const N = 900;
let puffTex = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const S = 128, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  const img = g.createImageData(S, S); let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const blobs = Array.from({ length: 14 }, () => ({ x: 0.3 + rnd() * 0.4, y: 0.3 + rnd() * 0.4, r: 0.12 + rnd() * 0.16 }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; let a = 0;
    for (const b of blobs) { const d = Math.hypot(u - b.x, v - b.y) / b.r; if (d < 1) a += (1 - d * d) * 0.35; }
    a *= Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.5) * 2) ** 0.6;                // kenar yumuşak
    const k = (y * S + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.min(255, a * 255);
  }
  g.putImageData(img, 0, 0);
  puffTex = new THREE.CanvasTexture(cv); return puffTex;
}

const VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSz;
uniform float kScale; varying vec2 vUv; varying vec4 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iSz.y), s = sin(iSz.y); vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
  mv.xy += p * iSz.x * kScale; vUv = position.xy + 0.5; vCol = iCol;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;
const FS = /* glsl */`
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
void main() {
  #include <logdepthbuf_fragment>
  float a = texture2D(map, vUv).a * vCol.a; if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class LaunchSmoke {
  // parent: rampa grubu (ölçek KM, birim metre) · kScale: KM · scale: roket büyüklüğüne göre bulut ölçeği (Saturn V/SLS 1, küçükler ~0,6)
  constructor(parent, kScale, { scale = 1, trenchDir = [0, 0, 1] } = {}) {
    const base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.getAttribute('position'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); this.aSz = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);
    for (const a of [this.aPos, this.aCol, this.aSz]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol); g.setAttribute('iSz', this.aSz); g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({ uniforms: { map: { value: puffTexture() }, kScale: { value: kScale } }, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; parent.add(this.mesh);
    this.p = []; this.scale = scale; this.td = trenchDir; this.acc = { trench: 0, deluge: 0, column: 0 }; this.seed = 11; this.lastMet = null;
  }
  rnd() { return (this.seed = (this.seed * 16807) % 2147483647) / 2147483647; }
  spawn(x, y, z, vx, vy, vz, size, grow, life, alpha, heat) {
    if (this.p.length >= N) this.p.shift();
    this.p.push({ x, y, z, vx, vy, vz, s: size, g: grow, life, age: 0, a: alpha, heat, rot: this.rnd() * 6.283, w: (this.rnd() - 0.5) * 0.3 });
  }
  // met: gerçek uçuş saniyesi · dt: gerçek uçuş saniyesi (hız çarpanıyla) · rocket: roket tabanı rampa çerçevesinde (m) · thr · sunUp · cam: kamera rampa çerçevesinde (m)
  update(met, dt, { rocket, thr, sunUp, cam }) {
    const S = this.scale, R = () => this.rnd(), td = this.td;
    dt = Math.min(dt, 2);
    if (dt > 0) {
      // su püskürtme buharı: T−8 s'den kalkışa dek rampa çevresinde, sonra azalarak
      if (met > -8 && met < 18) { this.acc.deluge += dt * (met < 0 ? 10 : 18 * Math.exp(-met / 8)); while (this.acc.deluge >= 1) { this.acc.deluge--;
        const a = R() * 6.283, r = (20 + R() * 25) * S; this.spawn(Math.cos(a) * r, 2 + R() * 6, Math.sin(a) * r, Math.cos(a) * 3, 3 + R() * 3, Math.sin(a) * 3, 18 * S, 7 * S, 14 + R() * 8, 0.32, 0); } }
      // alev çukuru: ateşlemeden (T−0) itibaren iki yöne fışkıran sıcak duman, roket yükseldikçe söner
      const hR = rocket ? rocket[1] : 0;
      if (met > -1 && thr > 0 && hR < 600) { this.acc.trench += dt * 60 * Math.exp(-hR / 220); while (this.acc.trench >= 1) { this.acc.trench--;
        const sgn = R() < 0.7 ? 1 : -1, sp = (50 + R() * 40) * S, sx = (R() - 0.5) * 0.5;
        this.spawn(td[0] * 30 * S * sgn, 4, td[2] * 30 * S * sgn, (td[0] * sgn + sx * td[2]) * sp, 4 + R() * 8, (td[2] * sgn + sx * td[0]) * sp, 22 * S, 12 * S, 22 + R() * 14, 0.55, 1); } }
      // egzoz sütunu: roketin bıraktığı iz (alçakta yoğun; 3 km üstünde incelir)
      if (rocket && thr > 0 && met > 0 && hR < 6000) { this.acc.column += dt * 26 * Math.exp(-hR / 2500); while (this.acc.column >= 1) { this.acc.column--;
        const j = R() * dt; this.spawn(rocket[0] + (R() - 0.5) * 6 * S, rocket[1] - (20 + j * 60) * S, rocket[2] + (R() - 0.5) * 6 * S, (R() - 0.5) * 4, -6 - R() * 6, (R() - 0.5) * 4, 16 * S, 6 * S, 30 + R() * 20, 0.42, 0.6); } }
      for (const q of this.p) {
        const drag = Math.exp(-dt / 3.5); q.vx *= drag; q.vz *= drag; q.vy = q.vy * drag + dt * 1.2;            // yavaşlar, ısıyla hafif yükselir
        q.x += q.vx * dt; q.y = Math.max(q.y + q.vy * dt, q.s * 0.25); q.z += q.vz * dt;
        q.s += q.g * dt * Math.exp(-q.age / 12); q.age += dt; q.rot += q.w * dt; q.heat *= Math.exp(-dt / 2.5);
      }
      this.p = this.p.filter((q) => q.age < q.life);
    }
    // uzaktan yakına sıralı (saydam karışım doğru üst üste binsin)
    if (cam) { for (const q of this.p) q.d = (q.x - cam[0]) ** 2 + (q.y - cam[1]) ** 2 + (q.z - cam[2]) ** 2; this.p.sort((a, b) => b.d - a.d); }
    const day = Math.max(0, Math.min(1, (sunUp + 0.1) / 0.4)), amb = 0.16 + 0.74 * day, P = this.aPos.array, C = this.aCol.array, Z = this.aSz.array;
    let n = 0;
    for (const q of this.p) {
      const f = q.age / q.life, al = q.a * Math.min(1, q.age * 1.5) * (1 - f) ** 1.3;
      const near = rocket && thr > 0 ? thr * Math.exp(-Math.hypot(q.x - rocket[0], q.y - rocket[1], q.z - rocket[2]) / 140) : 0, hot = Math.min(1, q.heat * 0.5 + near * 0.9);
      P[n * 3] = q.x; P[n * 3 + 1] = q.y; P[n * 3 + 2] = q.z;
      C[n * 4] = amb * 0.92 + hot * 1.4; C[n * 4 + 1] = amb * 0.92 + hot * 0.75; C[n * 4 + 2] = amb * 0.95 + hot * 0.3; C[n * 4 + 3] = al;
      Z[n * 2] = q.s; Z[n * 2 + 1] = q.rot; n++;
    }
    this.mesh.geometry.instanceCount = n;
    for (const a of [this.aPos, this.aCol, this.aSz]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
    this.count = n;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.material.dispose(); if (this.mesh.parent) this.mesh.parent.remove(this.mesh); }
}
