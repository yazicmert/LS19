// LS19 görsel efektler: uzay ortamı (IBL), motor plümü, RCS pufları, ayrılma parlaması, Ay tozu.
// Hepsi kamera merkezli (yüzen başlangıç) çizimle ve logaritmik derinlikle uyumlu özel gölgelendiricilerdir; plüm/duman efektleri toplamalı harmanlanır (HDR: bloom'a beslenir).
import * as THREE from 'three';
import { GLSL_NOISE } from './planets.js';

const KM = 0.001;

// ------------------------------------------------------------------ uzay ortamı: gezegen/Ay ışıması (earthshine/moonshine) için ön filtrelenmiş küp harita
// Ortam haritası yalnız bir "ışık lekesi" taşır (+z ekseni): sahne her karede haritayı o cisme doğru döndürür ve şiddetini
// cismin görünür açısal alanı ve Güneş'in aydınlattığı kesiriyle ölçekler (scene.js: updateEnv). Güneş doğrudan ışıktır (DirectionalLight), haritada yoktur.
const VS_ENV = /* glsl */`varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS_ENV = /* glsl */`
uniform vec3 col, base; uniform float cosA, cosB; varying vec3 vDir;
void main() {
  float c = vDir.z;                                          // leke ekseni +z
  float k = smoothstep(cosA, cosB, c);                       // kenarı yumuşak kapak
  float limb = 0.7 + 0.3 * smoothstep(cosA, 1.0, c);         // merkeze doğru hafif parlama (gerçek diskte kenar kararması az)
  gl_FragColor = vec4(base + col * k * limb, 1.0);
}`;
export const ENV_HALF_DEG = 70;                              // haritadaki leke yarı açısı: şiddet ölçeklemesi buna göre (sin² oranı)
export function makeSpaceEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer), out = {};
  const half = ENV_HALF_DEG * Math.PI / 180, soft = 14 * Math.PI / 180;
  for (const [name, col, base] of [['earth', [0.62, 0.78, 1.0], [0.0015, 0.002, 0.003]], ['moon', [1.0, 0.96, 0.9], [0.001, 0.001, 0.0012]]]) {
    const s = new THREE.Scene();
    const m = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), new THREE.ShaderMaterial({ vertexShader: VS_ENV, fragmentShader: FS_ENV, side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: { col: { value: new THREE.Vector3(...col) }, base: { value: new THREE.Vector3(...base) }, cosA: { value: Math.cos(half + soft) }, cosB: { value: Math.cos(half - soft) } } }));
    m.frustumCulled = false; s.add(m);
    out[name] = pm.fromScene(s, 0.02).texture;
    m.geometry.dispose(); m.material.dispose();
  }
  pm.dispose();
  return out;
}

// ------------------------------------------------------------------ motor plümü
// Yanma ekseni −z (yerel, metre): çıkıştan uca s = 0…1; yarıçap hızla açılır (vakum plümü) ve söner. Çıkışa yakın parlak çekirdek, kenarda turuncu→mavi geçişi,
// eksen boyunca akan gürültü, çok hafif şok elmasları ve kameraya çok yaklaşınca solma (kamera plümün içindeyken sert kesit olmasın).
const VS_PLUME = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying float vS; varying vec3 vN; varying vec3 vPos; varying vec3 vLoc;
void main() {
  vS = uv.y; vLoc = position; vec4 wp = modelMatrix * vec4(position, 1.0); vPos = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const FS_PLUME = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float throttle, gain, time, diamonds, seed, kS;
uniform vec3 hot, cool;
varying float vS; varying vec3 vN; varying vec3 vPos; varying vec3 vLoc;
${GLSL_NOISE}
void main() {
  #include <logdepthbuf_fragment>
  vec3 V = normalize(-vPos), N = normalize(vN);
  float ndv = abs(dot(N, V)), s = vS;
  float along = exp(-kS * s);                                         // eksen boyunca üstel sönme
  float rad = pow(ndv, 1.5);                                          // kenara doğru solma (hacim izlenimi)
  float n = fbm(vec3(vLoc.xy * 0.8, vLoc.z * 0.28 + time * 7.0 + seed));
  float a = along * rad * (0.55 + 0.9 * n);
  a *= smoothstep(0.0, 0.03, s) * (1.0 - smoothstep(0.62, 1.0, s));  // çıkışta sert disk yok, uç yumuşak biter
  a += pow(max(0.0, sin(s * 30.0 + 0.6)), 8.0) * pow(ndv, 5.0) * along * diamonds;     // zayıf şok elmasları
  a *= smoothstep(1.5, 12.0, length(vPos) * 1000.0);                  // kameraya <12 m: solar
  vec3 c = mix(cool, hot, smoothstep(0.04, 0.6, along * rad));        // sıcak çekirdek → soğuk kenar
  gl_FragColor = vec4(c * a * gain * throttle, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
let _plumeClock = 0;
export const plumeTick = (dt) => { _plumeClock += dt; };
// r0: çan çıkış yarıçapı (m), len: tam gazdaki uzunluk (m); hot/cool: çekirdek/kenar rengi (HDR); gain: parlaklık çarpanı; widen: açılma
export function plumeGeometry(r0, len, widen = 2.4) {
  const nS = 36, nA = 32, pos = new Float32Array((nS + 1) * (nA + 1) * 3), uv = new Float32Array((nS + 1) * (nA + 1) * 2), nor = new Float32Array((nS + 1) * (nA + 1) * 3), idx = [];
  const rad = (s) => r0 * (1 + widen * Math.sqrt(s)) * (1 - 0.55 * s * s);
  let i = 0;
  for (let j = 0; j <= nS; j++) {
    const s = j / nS, z = -s * len, r = rad(s), dr = (rad(Math.min(1, s + 1e-3)) - rad(Math.max(0, s - 1e-3))) / (2e-3 * len);       // dr/d(uzunluk)
    for (let k = 0; k <= nA; k++) {
      const a = k / nA * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), nl = Math.hypot(1, dr);                  // yüzey normali: (ca, sa, dr/dz) normalleştirilmiş; z azaldıkça s artar
      pos.set([r * ca, r * sa, z], i * 3); nor.set([ca / nl, sa / nl, dr / nl], i * 3); uv.set([k / nA, s], i * 2); i++;
    }
  }
  for (let j = 0; j < nS; j++) for (let k = 0; k < nA; k++) { const a = j * (nA + 1) + k, b = a + 1, c = a + nA + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
export function plumeMaterial(hot, cool, gain = 1.0, opts = {}) {
  const mat = new THREE.ShaderMaterial({ vertexShader: VS_PLUME, fragmentShader: FS_PLUME, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { throttle: { value: 0 }, gain: { value: gain }, time: { value: 0 }, diamonds: { value: opts.diamonds ?? 0.25 }, seed: { value: Math.random() * 50 }, kS: { value: opts.kS ?? 2.0 }, hot: { value: hot }, cool: { value: cool } } });
  return mat;
}
export function makePlume(r0, len, hot, cool, gain = 1.0, opts = {}, geometry = null) {
  const mat = plumeMaterial(hot, cool, gain, opts), m = new THREE.Mesh(geometry || plumeGeometry(r0, len, opts.widen ?? 2.4), mat); m.frustumCulled = false;
  m.userData.len = len;
  m.onBeforeRender = () => { mat.uniforms.time.value = _plumeClock; };
  return m;
}
// plümü gaza göre ölçekle (uzunluk ve yarıçap) ve ışımasını ayarla
export function setPlume(m, thr) {
  const u = m.material.uniforms; u.throttle.value = thr;
  m.visible = thr > 0.004;
  const l = 0.35 + 0.65 * Math.min(1, thr); m.scale.set(0.55 + 0.45 * Math.min(1, thr), 0.55 + 0.45 * Math.min(1, thr), l);
}

// ------------------------------------------------------------------ yumuşak ışıma sprite'ı (HDR): motor çıkışı, ayrılma parlaması
let _glowTex = null;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  _glowTex = new THREE.CanvasTexture(c); _glowTex.colorSpace = THREE.SRGBColorSpace; return _glowTex;
}
// dünya uzayında boyutlu (sizeAttenuation) parlama; renk HDR (>1) olabilir
export function makeGlow(color, sizeM) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  s.scale.set(sizeM, sizeM, 1); s.frustumCulled = false; return s;
}

// ------------------------------------------------------------------ parçacıklar: Ay tozu (iniş motoru) ve ayrılma pufları
// Tek bir THREE.Points; konumlar bir grubun yerel çerçevesinde METRE (grup ölçeği 1e-3): toz için iniş yerine bağlı yerel çerçeve (Ay'la döner, yalnız dışa püskürme hızı + Ay çekimi),
// puflar için aracı izleyen eylemsiz çerçeve. Parçacık başına boyut (m), ömür, başlangıç opaklığı; CPU'da balistik güncelleme (vakumda sürtünme yok).
const VS_PART = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSize; attribute float aAlpha;
uniform float scalePx;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = max(1e-7, -mv.z);
  float px = aSize * 0.001 / d * scalePx;
  gl_PointSize = clamp(px, 0.0, 192.0);
  vA = px < 0.8 ? 0.0 : aAlpha;
  #include <logdepthbuf_vertex>
}`;
const FS_PART = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor; uniform float uLit;
varying float vA;
void main() {
  #include <logdepthbuf_fragment>
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.0, 1.0, r); a *= a * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * uLit, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export class Particles {
  constructor(max, { additive = false, color = [1, 1, 1] } = {}) {
    this.max = max; this.n = 0; this.grow = additive ? 0.35 : 0.12;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.age = new Float32Array(max); this.life = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS_PART, fragmentShader: FS_PART, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scalePx: { value: 800 }, uColor: { value: new THREE.Color(...color) }, uLit: { value: 1 } } });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    this.group = new THREE.Group(); this.group.scale.setScalar(KM); this.group.add(this.points);
  }
  // p, v: metre, m/s (yerel çerçeve)
  spawn(px, py, pz, vx, vy, vz, size, life, alpha) {
    if (this.n >= this.max) return;
    const i = this.n++, a = i * 3;
    this.pos[a] = px; this.pos[a + 1] = py; this.pos[a + 2] = pz; this.vel[a] = vx; this.vel[a + 1] = vy; this.vel[a + 2] = vz;
    this.size[i] = size; this.life[i] = life; this.age[i] = 0; this.a0[i] = alpha; this.alpha[i] = 0;
  }
  // g: yerel çerçevede yerçekimi ivmesi [gx, gy, gz]; killZ: bu yerel z'nin altına inen parçacık ölür (toz yere düşünce); null = yok
  update(dt, g = [0, 0, 0], killZ = null) {
    let n = this.n;
    for (let i = 0; i < n;) {
      const a = i * 3; let age = this.age[i] += dt;
      const life = this.life[i];
      this.vel[a] += g[0] * dt; this.vel[a + 1] += g[1] * dt; this.vel[a + 2] += g[2] * dt;
      this.pos[a] += this.vel[a] * dt; this.pos[a + 1] += this.vel[a + 1] * dt; this.pos[a + 2] += this.vel[a + 2] * dt;
      if (age >= life || (killZ !== null && this.pos[a + 2] < killZ)) {                    // sondaki parçacığı bu yuvaya taşı
        n--; if (i !== n) { const b = n * 3; this.pos[a] = this.pos[b]; this.pos[a + 1] = this.pos[b + 1]; this.pos[a + 2] = this.pos[b + 2]; this.vel[a] = this.vel[b]; this.vel[a + 1] = this.vel[b + 1]; this.vel[a + 2] = this.vel[b + 2];
          this.size[i] = this.size[n]; this.life[i] = this.life[n]; this.age[i] = this.age[n]; this.a0[i] = this.a0[n]; this.alpha[i] = this.alpha[n]; }
        continue;
      }
      const k = age / life; this.alpha[i] = this.a0[i] * Math.min(1, age / 0.12) * (1 - k) * (1 - k);          // hızlı doğuş, yavaş sönme
      this.size[i] *= 1 + dt * this.grow;                                                      // hafif genleşme
      i++;
    }
    this.n = n;
    const geo = this.points.geometry; geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = true;
    this.group.visible = n > 0;
  }
  setView(heightPx, fovDeg) { this.mat.uniforms.scalePx.value = (heightPx / 2) / Math.tan(fovDeg * Math.PI / 360); }
}
