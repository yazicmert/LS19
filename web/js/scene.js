// LS19 görüntüleyici: tek sahne, gerçek ölçek (1 birim = 1 km), kamera merkezli çizim + logaritmik derinlik.
// Dünya, Ay, Güneş, yıldızlar ve araç gerçek konum/yönelimlerinde; her kare fizikten gelen durumla güncellenir.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as E from './engine.js';
import { buildTerrain, detailNormalTexture, HOLE_R } from './terrain.js';
import { R_SITE, SITE_LAT, SITE_LON, siteIcrf, siteMe } from './mission.js';
import { BODIES } from './ephem.js';
import { etOf } from './live.js';
import { HaloRef } from './halo.js';
import { PLANET_VIS, planetMaterial, atmosphereMesh, ringMaterial, loadPlanetTextures, planetQuaternion } from './planets.js';
// gezegen yarıçapları (km), renk, IAU kutup yönü (RA, Dec derece), bant belirginliği, halka (iç, dış km)
export const PLANETS = {
  1: { name: 'Merkür', R: 2439.7, c: 0x9a9591, pole: [281.01, 61.41] }, 2: { name: 'Venüs', R: 6051.8, c: 0xe8d8a8, pole: [272.76, 67.16] },
  5: { name: 'Mars', R: 3389.5, c: 0xc1623f, pole: [317.68, 52.89] }, 6: { name: 'Jüpiter', R: 69911, c: 0xd9b98a, pole: [268.06, 64.50], bands: 1.0 },
  7: { name: 'Satürn', R: 58232, c: 0xe3cf9b, pole: [40.59, 83.54], bands: 0.55, ring: [74500, 140220] },
  8: { name: 'Uranüs', R: 25362, c: 0x9fdbe3, pole: [257.31, -15.18], bands: 0.1 }, 9: { name: 'Neptün', R: 24622, c: 0x4a6fe0, pole: [299.36, 43.46], bands: 0.3 },
  10: { name: 'Plüton', R: 1188.3, c: 0xc8b49a, pole: [132.99, -6.16] } };
const poleVec = ([ra, de]) => { const a = ra * Math.PI / 180, d = de * Math.PI / 180; return new THREE.Vector3(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)); };
import * as CR from './cr3bp.js';
const K_EMB = E.MU_M / (E.MU_E + E.MU_M);          // Dünya–Ay kütle merkezi: Dünya'dan Ay'a doğru bu oranda

const { add, sub, scale, dot, cross, norm, unit, mv, mtv } = E;
const SUN_I = 1.6;                       // tonlamadan önce Güneş aydınlığı (Ay, araç, arazi)
const EARTH_I = 1.15;                    // Dünya (bulutlar ve okyanus yansıması parlak olduğundan düşük)
const KM = 0.001;                        // m -> km

// ------------------------------------------------------------------ yardımcılar
function sphereGeometry(R, nLon, nLat) {
  const n = (nLon + 1) * (nLat + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
  let i = 0;
  for (let j = 0; j <= nLat; j++) {
    const v = j / nLat, lat = -Math.PI / 2 + v * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let k = 0; k <= nLon; k++) {
      const u = k / nLon, lon = -Math.PI + u * 2 * Math.PI;
      pos[i * 3] = R * cl * Math.cos(lon); pos[i * 3 + 1] = R * cl * Math.sin(lon); pos[i * 3 + 2] = R * sl;
      uv[i * 2] = u; uv[i * 2 + 1] = v; i++;
    }
  }
  for (let j = 0; j < nLat; j++) for (let k = 0; k < nLon; k++) {
    const a = j * (nLon + 1) + k, b = a + 1, c = a + nLon + 1, d = c + 1;
    if (j > 0) idx.push(a, b, d);
    if (j < nLat - 1) idx.push(a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
const m3ToQuat = (M) => {            // satır matrisi (ICRF sütunları) -> THREE.Quaternion; M: yerel -> ICRF
  const m = new THREE.Matrix4().set(M[0][0], M[0][1], M[0][2], 0, M[1][0], M[1][1], M[1][2], 0, M[2][0], M[2][1], M[2][2], 0, 0, 0, 0, 1);
  return new THREE.Quaternion().setFromRotationMatrix(m);
};
function bodyMatrix(z, ref) {       // z ekseni verilen, x ref'e yakın: yerel -> ICRF (sütunlar x,y,z)
  z = unit(z); let x = sub(ref, scale(z, dot(ref, z)));
  if (norm(x) < 1e-6) x = cross(z, [0, 0, 1]);
  x = unit(x); const y = cross(z, x);
  return [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
}
function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function ringTexture(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  g.strokeStyle = 'white'; g.lineWidth = size * 0.1; g.beginPath(); g.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'white'; g.beginPath(); g.arc(size / 2, size / 2, size * 0.12, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const VS_BODY = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform sampler2D heightMap; uniform vec2 hSize; uniform float radius; uniform float useHeight;
varying vec3 vN; varying vec3 vE; varying vec3 vPos; varying vec2 vUv; varying vec3 vLocal;
float decH(vec4 c) { return (c.r * 255.0 * 256.0 + c.g * 255.0) / 65535.0 * 21.0 - 10.0; }
float hAt(vec2 uv) {
  vec2 p = uv * hSize - 0.5; ivec2 i0 = ivec2(floor(p)); vec2 f = fract(p);
  int W = int(hSize.x), H = int(hSize.y);
  int x0 = i0.x < 0 ? i0.x + W : (i0.x >= W ? i0.x - W : i0.x); int x1 = x0 + 1 >= W ? 0 : x0 + 1;
  ivec2 a = ivec2(x0, clamp(i0.y, 0, H - 1)), b = ivec2(x1, clamp(i0.y, 0, H - 1));
  ivec2 c = ivec2(a.x, clamp(i0.y + 1, 0, H - 1)), d = ivec2(b.x, c.y);
  float h00 = decH(texelFetch(heightMap, a, 0)), h10 = decH(texelFetch(heightMap, b, 0));
  float h01 = decH(texelFetch(heightMap, c, 0)), h11 = decH(texelFetch(heightMap, d, 0));
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}
void main() {
  vUv = uv; vec3 dir = normalize(position); vLocal = dir;
  vec3 p = position;
  if (useHeight > 0.5) p = dir * (radius + hAt(uv));
  vec4 wp = modelMatrix * vec4(p, 1.0); vPos = wp.xyz;
  vN = normalize(mat3(modelMatrix) * dir);
  vec3 e = vec3(-dir.y, dir.x, 0.0); float le = length(e); e = le > 1e-6 ? e / le : vec3(1.0, 0.0, 0.0);
  vE = normalize(mat3(modelMatrix) * e);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

const FS_EARTH = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D dayMap, nightMap, cloudMap, specMap, normalMap; uniform vec3 sunDir; uniform float sunI; uniform float obsMode;
varying vec3 vN; varying vec3 vE; varying vec3 vPos; varying vec2 vUv; varying vec3 vLocal;
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN), T = normalize(vE), B = cross(N, T);
  vec3 nm = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
  vec3 Np = normalize(T * nm.x * 0.8 + B * nm.y * 0.8 + N * max(nm.z, 0.2));
  vec3 L = normalize(sunDir), V = normalize(-vPos), H = normalize(L + V);
  float ndl = dot(N, L), ndlp = max(dot(Np, L), 0.0);
  float cloud = texture2D(cloudMap, vUv).r; cloud = smoothstep(0.08, 0.9, cloud);
  float spec = texture2D(specMap, vUv).r;
  vec3 day = texture2D(dayMap, vUv).rgb;
  float tw = smoothstep(-0.12, 0.2, ndl);
  vec3 sunCol = mix(vec3(1.0, 0.55, 0.3), vec3(1.0), smoothstep(0.0, 0.35, ndl));
  vec3 col = day * ndlp * sunCol * tw;
  float glint = spec * pow(max(dot(N, H), 0.0), 90.0) * 1.6 + spec * pow(max(dot(N, H), 0.0), 12.0) * 0.08;
  col += glint * sunCol * step(0.0, ndl) * (1.0 - cloud);
  col = mix(col, vec3(0.85) * max(ndl, 0.0) * sunCol * tw, cloud * 0.9);
  vec3 night = texture2D(nightMap, vUv).rgb;
  col += night * vec3(1.0, 0.78, 0.5) * (1.0 - smoothstep(-0.12, 0.05, ndl)) * (1.0 - cloud * 0.85) * 0.9 / sunI;
  float mu = max(dot(N, V), 0.0);
  col = mix(col, vec3(0.32, 0.55, 1.0) * max(ndl + 0.15, 0.0) * 0.7, pow(1.0 - mu, 3.0) * 0.45);
  // yerdeki gözlemci: yakın zemin doku çözünürlüğünün altında; sade, aydınlanmaya göre koyulaşan zemin (şehir ışığı pikseli büyümesin)
  if (obsMode > 0.5) { float nearG = 1.0 - smoothstep(60.0, 500.0, length(vPos));
    vec3 g = vec3(0.018, 0.02, 0.024) + day * 0.35 * max(ndl, 0.0) * sunCol + vec3(0.25, 0.32, 0.45) * 0.05 * smoothstep(-0.2, 0.1, ndl);
    col = mix(col, g, nearG); }
  gl_FragColor = vec4(col * sunI, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const VS_ATM = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN; varying vec3 vPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0); vPos = wp.xyz; vN = normalize(mat3(modelMatrix) * normalize(position));
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const FS_ATM = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 sunDir; uniform float sunI;
varying vec3 vN; varying vec3 vPos;
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN), V = normalize(-vPos), L = normalize(sunDir);
  float mu = abs(dot(N, V)); float rim = pow(1.0 - mu, 3.2);
  float ndl = dot(N, L);
  vec3 c = mix(vec3(1.0, 0.42, 0.12), vec3(0.28, 0.55, 1.0), smoothstep(-0.05, 0.35, ndl));
  float a = rim * smoothstep(-0.35, 0.25, ndl) * 1.3;
  gl_FragColor = vec4(c * a * sunI * 0.6, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FS_MOON = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D colorMap, normalMap; uniform vec3 sunDir, earthDir; uniform float sunI, holeCos, albScale; uniform vec3 siteDir;
varying vec3 vN; varying vec3 vE; varying vec3 vPos; varying vec2 vUv; varying vec3 vLocal;
void main() {
  if (dot(normalize(vLocal), siteDir) > holeCos) discard;
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN), T = normalize(vE), B = cross(N, T);
  vec3 nm = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
  vec3 Np = normalize(T * nm.x + B * nm.y + N * max(nm.z, 0.2));
  vec3 L = normalize(sunDir), V = normalize(-vPos);
  float mu0 = max(dot(Np, L), 0.0), mu = max(dot(N, V), 0.05);
  float I = mix(mu0, 2.0 * mu0 / (mu0 + mu + 1e-4), 0.45);
  vec3 alb = texture2D(colorMap, vUv).rgb * albScale;
  vec3 col = alb * I * sunI + alb * 0.012 * max(dot(Np, normalize(earthDir)), 0.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const VS_FLAME = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying float vAlong; varying vec3 vN; varying vec3 vPos;
void main() {
  vAlong = uv.y; vec4 wp = modelMatrix * vec4(position, 1.0); vPos = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const FS_FLAME = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float throttle, gain; uniform vec3 hot; uniform vec3 cool;
varying float vAlong; varying vec3 vN; varying vec3 vPos;
void main() {
  #include <logdepthbuf_fragment>
  float t = 1.0 - vAlong;                         // 0: meme çıkışı, 1: uç
  float edge = pow(abs(dot(normalize(vN), normalize(-vPos))), 1.5);
  float a = throttle * (1.0 - t) * (1.0 - t) * edge;
  vec3 c = mix(hot, cool, t);
  gl_FragColor = vec4(c * a * gain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ------------------------------------------------------------------ dünya
export class World {
  constructor(canvas, labelsEl) {
    this.canvas = canvas; this.labelsEl = labelsEl;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 1e-5, 1e11);
    this.cam = { mode: 'VEHICLE', az: -2.3, el: 0.22, dist: 0.055, auto: true, key: '' };
    this.trail = { E: [], M: [], last: null };
    this.labels = {};
    this.att = null;                 // görüntülenen araç yönelimi (yerel->ICRF matris)
    this.sepAtt = null;
    this.ready = false;
  }

  async load(base, onProgress = () => {}) {
    this.base = base;
    const tl = new THREE.TextureLoader(), total = 12; let done = 0;
    const tick = (n) => { done++; onProgress(done / total, n); };
    const tex = (f, srgb = true) => new Promise((res) => tl.load(base + 'textures/' + f, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; tick(f); res(t);
    }, undefined, () => { tick(f + ' (yok)'); res(null); }));
    const json = (f) => fetch(base + f).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [day, night, clouds, spec, enorm, mcol, mnorm, mh, stars, dem] = await Promise.all([
      tex('earth_day.jpg'), tex('earth_night.jpg'), tex('earth_clouds.jpg', false), tex('earth_spec.png', false), tex('earth_normal.png', false),
      tex('moon_color.jpg'), tex('moon_normal.jpg', false), tex('moon_height.png', false), tex('stars.jpg'), json('data/site_dem.json')]);
    tick('dem');
    const gl = new GLTFLoader();
    const glb = (f) => new Promise((res) => gl.load(base + 'models/' + f, (g) => { tick(f); res(g.scene); }, undefined, () => { tick(f + ' (yok)'); res(null); }));
    const [lander, stage] = await Promise.all([glb('lander.glb'), glb('stage.glb')]);
    this.build({ day, night, clouds, spec, enorm, mcol, mnorm, mh, stars, dem, lander, stage });
    this.ready = true;
  }

  build(A) {
    const S = this.scene;
    const flat = (c) => { const d = new THREE.DataTexture(new Uint8Array(c), 1, 1); d.needsUpdate = true; return d; };
    // yıldızlar
    const starGeo = sphereGeometry(1e7, 64, 32);
    const starMat = new THREE.MeshBasicMaterial({ map: A.stars, side: THREE.BackSide, depthWrite: false, color: new THREE.Color(0.55, 0.55, 0.6) });
    if (!A.stars) starMat.color.set(0, 0, 0);
    this.stars = new THREE.Mesh(starGeo, starMat); this.stars.renderOrder = -10; this.stars.frustumCulled = false; S.add(this.stars);
    // Güneş
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,244,225,1)'), sizeAttenuation: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.sunSprite.scale.set(0.09, 0.09, 1); this.sunSprite.renderOrder = -9; S.add(this.sunSprite);
    this.sunLight = new THREE.DirectionalLight(0xffffff, Math.PI * SUN_I);
    this.sunLight.castShadow = true; this.sunLight.shadow.mapSize.set(2048, 2048); this.sunLight.shadow.bias = -0.0005; this.sunLight.shadow.normalBias = 0.00002;
    S.add(this.sunLight); S.add(this.sunLight.target);
    this.ambient = new THREE.AmbientLight(0x8899bb, 0.02); S.add(this.ambient);
    // Dünya
    const eu = { dayMap: { value: A.day || flat([40, 80, 160, 255]) }, nightMap: { value: A.night || flat([0, 0, 0, 255]) },
      cloudMap: { value: A.clouds || flat([0, 0, 0, 255]) }, specMap: { value: A.spec || flat([0, 0, 0, 255]) },
      normalMap: { value: A.enorm || flat([128, 128, 255, 255]) }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, sunI: { value: EARTH_I },
      heightMap: { value: flat([0, 0, 0, 255]) }, hSize: { value: new THREE.Vector2(1, 1) }, radius: { value: E.R_E }, useHeight: { value: 0 }, obsMode: { value: 0 } };
    this.earth = new THREE.Mesh(sphereGeometry(E.R_E, 1024, 512), new THREE.ShaderMaterial({ uniforms: eu, vertexShader: VS_BODY, fragmentShader: FS_EARTH }));
    this.earth.frustumCulled = false; S.add(this.earth);
    this.atm = new THREE.Mesh(sphereGeometry(E.R_E * 1.0125, 256, 128), new THREE.ShaderMaterial({
      uniforms: { sunDir: eu.sunDir, sunI: eu.sunI }, vertexShader: VS_ATM, fragmentShader: FS_ATM, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.atm.frustumCulled = false; S.add(this.atm);
    // Ay (LOLA ile yer değiştirmiş)
    const sd = siteMe();
    const mu = { colorMap: { value: A.mcol || flat([150, 150, 150, 255]) }, normalMap: { value: A.mnorm || flat([128, 128, 255, 255]) },
      heightMap: { value: A.mh || flat([0, 0, 0, 255]) }, hSize: { value: new THREE.Vector2(A.mh ? A.mh.image.width : 1, A.mh ? A.mh.image.height : 1) },
      radius: { value: E.R_M }, useHeight: { value: A.mh ? 1 : 0 },
      sunDir: { value: new THREE.Vector3(1, 0, 0) }, earthDir: { value: new THREE.Vector3(1, 0, 0) }, sunI: { value: SUN_I },
      siteDir: { value: new THREE.Vector3(sd[0], sd[1], sd[2]) }, albScale: { value: 0.8 }, holeCos: { value: A.dem ? Math.cos(HOLE_R / E.R_M) : 2.0 } };
    if (A.mh) { A.mh.magFilter = THREE.NearestFilter; A.mh.minFilter = THREE.NearestFilter; A.mh.generateMipmaps = false; A.mh.flipY = true; }
    this.moon = new THREE.Mesh(sphereGeometry(E.R_M, 1024, 512), new THREE.ShaderMaterial({ uniforms: mu, vertexShader: VS_BODY, fragmentShader: FS_MOON }));
    this.moon.frustumCulled = false; S.add(this.moon);
    this.moonU = mu; this.earthU = eu;
    // iniş arazisi
    if (A.dem) {
      const T = buildTerrain(A.dem, SITE_LAT * 180 / Math.PI, SITE_LON * 180 / Math.PI, E.R_M, R_SITE - E.R_M);
      const mat = new THREE.MeshStandardMaterial({ map: A.mcol, vertexColors: true, roughness: 1.0, metalness: 0.0, color: new THREE.Color(0.8, 0.8, 0.8),
        normalMap: detailNormalTexture(), normalScale: new THREE.Vector2(0.9, 0.9) });
      this.terrain = new THREE.Mesh(T.geometry, mat); this.terrain.receiveShadow = true; this.terrain.frustumCulled = false;
      this.terrainSite = T.sitePosMe; S.add(this.terrain);
    }
    // araç
    this.vehicle = new THREE.Group(); S.add(this.vehicle);
    this.landerModel = this.prepModel(A.lander, 'lander');
    this.stageModel = this.prepModel(A.stage, 'stage');
    this.vehicle.add(this.landerModel);
    this.stackStage = this.stageModel.clone(); this.stackStage.position.set(0, 0, -3.05 * KM); this.vehicle.add(this.stackStage);
    this.spent = new THREE.Group(); this.spent.add(this.stageModel); this.spent.visible = false; S.add(this.spent);
    // alevler
    // alevler model grubunun içinde: birimler metre (grup ölçeği 1e-3)
    this.flameL = this.makeFlame(0.55, 7.0, new THREE.Color(1.0, 0.85, 0.65), new THREE.Color(0.35, 0.45, 1.0), 0.8);
    this.flameL.position.set(0, 0, this.landerExitZ ?? -1.6); this.landerModel.add(this.flameL);
    this.flameS = this.makeFlame(1.0, 20.0, new THREE.Color(0.7, 0.75, 1.0), new THREE.Color(0.2, 0.3, 0.9), 0.35);   // LH2/LOX: vakumda soluk
    this.flameS.position.set(0, 0, this.stageExitZ ?? -16); this.stackStage.add(this.flameS);
    this.engineLight = new THREE.PointLight(0xffb070, 0, 0.08, 2); this.engineLight.position.set(0, 0, (this.landerExitZ ?? -1.6) - 1.0); this.landerModel.add(this.engineLight);
    // işaretçiler
    const ring = ringTexture();
    const mk = (color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ring, color, sizeAttenuation: false, depthTest: false, toneMapped: false }));
      s.scale.set(size, size, 1); s.renderOrder = 10; S.add(s); return s; };
    this.vehMarker = mk(0xffd27a, 0.022); this.stageMarker = mk(0x9aa3b5, 0.014); this.siteMarker = mk(0x7ee0a8, 0.016);
    // çizgiler
    const line = (n, color, opacity = 1) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.setDrawRange(0, 0);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false }));
      l.frustumCulled = false; S.add(l); return l;
    };
    this.osc = line(721, 0x49b6ff); this.trailLineE = line(40000, 0xff9d3c, 0.9); this.trailLineM = line(40000, 0xffb35c, 0.9);
    this.moonPath = line(600, 0x6f8f7a, 0.55); this.stageOsc = line(361, 0x8a93a6, 0.5);
    // Dünya–Ay kütle merkezi: iki cismin bu nokta etrafındaki yolları (canlı efemeristen)
    this.embEarth = line(400, 0x5fb0ff, 0.95); this.embEarth.material.depthTest = false; this.embEarth.renderOrder = 5;
    this.embMoon = line(400, 0xb9c4d0, 0.6);
    this.embMarker = mk(0xffffff, 0.013); this.embMarker.material.depthTest = false;
    // halo referans yörüngesi (Ay merkezli, eylemsiz) ve Dünya–Ay L1/L2 noktaları
    this.haloPath = line(4000, 0xc38cff, 0.75); this.haloPath.visible = false;
    this.lMarkers = [mk(0xd7b8ff, 0.011), mk(0xd7b8ff, 0.011)];
    // dönüş eksenleri ve başlangıç meridyeni (dönüşü gözle görünür kılar)
    const axisLine = (color) => { const l = line(2, color, 0.9); l.geometry.setDrawRange(0, 2); return l; };
    this.earthAxis = axisLine(0x9fd2ff); this.moonAxis = axisLine(0xd9d9d9);
    this.earthMer = axisLine(0xffd27a); this.moonMer = axisLine(0xffd27a);
    // Güneş sistemi: gezegen işaretçileri ve güneş merkezli anlık yörüngeleri
    this.planets = [];
    const PC = { 1: 0xb1a79a, 2: 0xe8cf94, 3: 0x5fb0ff, 5: 0xe0764a, 6: 0xd8b98d, 7: 0xe6d49a, 8: 0x9fe0e6, 9: 0x6f8fff, 10: 0xb0a090 };
    for (const i of [1, 2, 3, 5, 6, 7, 8, 9, 10]) {
      const m = mk(PC[i], i === 3 ? 0.012 : 0.009), o = line(361, PC[i], 0.55);
      const d = document.createElement('div'); d.className = 'lbl'; d.textContent = i === 3 ? 'Dünya–Ay' : BODIES[i].name; this.labelsEl.appendChild(d);
      const pl = { i, m, o, d }, info = PLANETS[i];
      if (info) {
        const vis = PLANET_VIS[i], pv = poleVec(info.pole); pl.vis = vis;
        pl.mesh = new THREE.Mesh(sphereGeometry(info.R, 256, 128), planetMaterial(info, vis, pv));
        pl.mesh.frustumCulled = false; pl.mesh.visible = false; S.add(pl.mesh);
        pl.atm = atmosphereMesh(info, vis, sphereGeometry, pl.mesh.material.uniforms.sunDir); if (pl.atm) { pl.atm.renderOrder = 3; S.add(pl.atm); }
        if (info.ring) {
          const rg = new THREE.RingGeometry(info.ring[0], info.ring[1], 256, 8);
          // halka yoğunluğu: yarıçapa göre (C, B, Cassini boşluğu, A)
          const cv = document.createElement('canvas'); cv.width = 512; cv.height = 1; const g2 = cv.getContext('2d');
          for (let x = 0; x < 512; x++) { const r = info.ring[0] + (info.ring[1] - info.ring[0]) * x / 511;
            let a = r < 92000 ? 0.25 : r < 117580 ? 0.85 : r < 122170 ? 0.08 : r < 136780 ? 0.6 : r < 139800 ? 0.03 : 0.3;
            g2.fillStyle = `rgba(222,205,165,${a})`; g2.fillRect(x, 0, 1, 1); }
          const tex = new THREE.CanvasTexture(cv);
          const pos = rg.attributes.position, uv = rg.attributes.uv;
          for (let k = 0; k < pos.count; k++) { const r = Math.hypot(pos.getX(k), pos.getY(k)); uv.setXY(k, (r - info.ring[0]) / (info.ring[1] - info.ring[0]), 0.5); }
          pl.ring = new THREE.Mesh(rg, ringMaterial(info, pv)); pl.ring.material.uniforms.ringMap.value = tex; pl.ring.renderOrder = 4;   // gerçek doku inince değişir
          pl.mesh.material.uniforms.ringMap.value = tex; pl.mesh.material.uniforms.ringOn.value = 1;
          pl.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), poleVec(info.pole));
          pl.ring.frustumCulled = false; pl.ring.visible = false; S.add(pl.ring);
        }
      }
      this.planets.push(pl);
    }
    // etiketler
    for (const [k, txt] of [['earth', 'Dünya'], ['moon', 'Ay'], ['veh', 'Araç'], ['stage', 'TLI kademesi'], ['site', 'Apollo 11 iniş yeri'], ['emb', 'Dünya–Ay kütle merkezi'], ['lp', 'L1'], ['lp2', 'L2']]) {
      const d = document.createElement('div'); d.className = 'lbl lbl-' + k; d.textContent = txt; this.labelsEl.appendChild(d); this.labels[k] = d;
    }
  }

  prepModel(scene3, kind) {
    const g = new THREE.Group();
    if (!scene3) {                          // model yoksa basit yedek geometri
      const mat = new THREE.MeshStandardMaterial({ color: kind === 'lander' ? 0xc8a24a : 0xdadde2, metalness: 0.6, roughness: 0.4 });
      const m = kind === 'lander' ? new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 3.2, 16), mat) : new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 12, 16), mat);
      m.rotation.x = Math.PI / 2; if (kind === 'stage') m.position.z = -8;
      g.add(m); g.scale.setScalar(KM);
      if (kind === 'lander') this.landerExitZ = -1.6; else this.stageExitZ = -16;
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      return g;
    }
    const inner = new THREE.Group(); inner.rotation.x = Math.PI / 2; inner.add(scene3);   // glTF Y-yukarı -> Blender Z-yukarı
    g.add(inner); g.scale.setScalar(KM);
    g.updateMatrixWorld(true);
    // malzemeleri yeniden ayarla (Blender düğüm ağaçları glTF'ye tam geçmez)
    const P = {
      MLI_Altin_Folyo: { color: 0xc9983a, metalness: 1.0, roughness: 0.32 }, Beyaz_Boya: { color: 0xe9e9e4, metalness: 0.0, roughness: 0.55 },
      Koyu_Gri: { color: 0x3b3d42, metalness: 0.2, roughness: 0.6 }, Titanyum: { color: 0x9b9ea3, metalness: 1.0, roughness: 0.35 },
      Gunes_Paneli: { color: 0x1b2748, metalness: 0.5, roughness: 0.25 }, Nozul_Niyobyum: { color: 0x6c6a6e, metalness: 1.0, roughness: 0.42 } };
    scene3.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const name = (o.material && o.material.name) || '';
      const key = Object.keys(P).find((k) => name.startsWith(k));
      if (key) { const p = P[key]; o.material = new THREE.MeshStandardMaterial({ color: p.color, metalness: p.metalness, roughness: p.roughness, name }); }
      else if (o.material) { o.material.metalness = Math.min(o.material.metalness ?? 0.5, 0.9); }
    });
    // meme çıkışı (motor çanının en alt noktası)
    const find = (names) => { let f = null; scene3.traverse((o) => { if (!f && names.some((n) => o.name.startsWith(n))) f = o; }); return f; };
    const bell = kind === 'lander' ? find(['Motor_Cani']) : find(['K_RL10_Uzatma', 'K_RL10_Rejen_Can']);
    if (bell) {
      const box = new THREE.Box3().setFromObject(bell), inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
      const zmin = box.clone().applyMatrix4(inv).min.z;
      if (kind === 'lander') this.landerExitZ = zmin; else this.stageExitZ = zmin;
    }
    return g;
  }

  makeFlame(r0, len, hot, cool, gain = 1.0) {
    const geo = new THREE.CylinderGeometry(r0 * 0.9, r0 * 2.6, len, 32, 1, true);
    geo.translate(0, -len / 2, 0); geo.rotateX(Math.PI / 2);          // -z yönünde uzanır
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: { throttle: { value: 0 }, gain: { value: gain }, hot: { value: hot }, cool: { value: cool } },
      vertexShader: VS_FLAME, fragmentShader: FS_FLAME, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.frustumCulled = false; return m;
  }

  resetDynamic() { this.embT = null; this.plT = null; this.embRef = null; this.moonPathT = null; this.trail = { E: [], M: [] }; this.sepAtt = null; this.attQ = null; }
  // tasarım: halo profilinde referans halo yörüngesini (Ay'a göre) örnekle
  setDesign(D) {
    this.haloPts = null;
    if (D && D.profile === 'HALO' && D.HALO && D.HALO.patches) {
      const ref = new HaloRef(null, D.HALO.patches, D.HALO.tDep, D.HALO.tNri);
      this.haloPts = ref.sample(Math.max(600, D.HALO.T / 400)).map((q) => q.r);
    }
  }

  addTrail(points, reset) {
    if (reset) this.trail = { E: [], M: [] };
    for (const q of points) {
      const rm = E.moonPos(q.t), rs = sub(q.r, rm);
      if (norm(rs) < E.MOON_ZONE) this.trail.M.push(rs); else this.trail.E.push(q.r);
    }
  }

  planetGeo(i, t) { const L = this.live.L, et = etOf(t); return sub(L.body(i, et)[0], L.body(3, et)[0]); }
  focusPos(t) {
    const f = this.cam.focus; if (!f) return null;
    if (f.kind === 'planet') return this.live ? this.planetGeo(f.i, t) : null;
    return f.fn ? f.fn(t) : null;
  }
  planetInfo(i, t) {
    const L = this.live.L, et = etOf(t), [p, v] = L.body(i, et), [ps, vs] = L.body(0, et), [pe] = L.body(3, et), info = PLANETS[i];
    const rh = sub(p, ps), vh = sub(v, vs), mu = BODIES[0].gm + BODIES[i].gm, el = E.elements(rh, vh, mu), AU = 149597870.7;
    const dE = norm(sub(p, pe));
    return { name: info.name, R: info.R, dSun: norm(rh) / AU, dEarth: dE / AU, lightMin: dE / 299792.458 / 60, v: norm(vh),
      periodDays: el.a > 0 ? 2 * Math.PI * Math.sqrt(el.a ** 3 / mu) / 86400 : NaN, a: el.a / AU, e: el.e };
  }
  resize(w, h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  // ---------------------------------------------------------------- kamera
  cameraPose(x, info) {
    const c = this.cam, t = x.t, rm = info.rm;
    const sph = (az, el) => [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    const fromBasis = (B, d) => add(add(scale(B[0], d[0]), scale(B[1], d[1])), scale(B[2], d[2]));
    if (c.mode === 'EARTH' || c.mode === 'MOON') {
      const cen = c.mode === 'EARTH' ? [0, 0, 0] : rm;
      return { eye: add(cen, scale(sph(c.az, c.el), c.dist)), target: cen, up: [0, 0, 1] };
    }
    if (c.mode === 'SYSTEM' || c.mode === 'EMB') {          // Dünya–Ay kütle merkezine bağlı, eylemsiz (ICRF eksenli, Ay yörünge düzlemine göre)
      const vm = E.moonVel(t), z = unit(cross(rm, vm)), cen = scale(rm, K_EMB);
      const ref = this.embRef || (this.embRef = unit(rm)), xx = unit(sub(ref, scale(z, dot(ref, z)))), y = cross(z, xx);
      return { eye: add(cen, scale(fromBasis([xx, y, z], sph(c.az, c.el)), c.dist)), target: cen, up: z };
    }
    if (c.mode === 'FOCUS' && c.focus) {                    // seçilen gezegen ya da uydu etrafında
      const tp = this.focusPos(t) || [0, 0, 0];
      const B = c.focus.kind === 'planet' || c.focus.kind === 'ast' ? [[1, 0, 0], cross([0, -0.3977771559, 0.9174820621], [1, 0, 0]), [0, -0.3977771559, 0.9174820621]] : [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      return { eye: add(tp, scale(fromBasis(B, sph(c.az, c.el)), c.dist)), target: tp, up: B[2] };
    }
    if (c.mode === 'OBS' && this.obsPose) {                 // yerdeki gözlemci: gökyüzüne bakış (az kuzeyden, el ufuktan)
      const o = this.obsPose(t), up = o.up, east = o.east, north = cross(up, east);
      let dir;
      if (c.lookFn) { const q = c.lookFn(t); if (q) { dir = unit(sub(q, o.eye)); const e = Math.asin(Math.max(-1, Math.min(1, dot(dir, up))));
        c.el = e; c.az = Math.atan2(dot(dir, east), dot(dir, north)); } }
      if (!dir) dir = add(add(scale(north, Math.cos(c.el) * Math.cos(c.az)), scale(east, Math.cos(c.el) * Math.sin(c.az))), scale(up, Math.sin(c.el)));
      if (!c.userFov && Math.abs(this.camera.fov - 70) > 0.05) { this.camera.fov = 70; this.camera.updateProjectionMatrix(); }
      return { eye: o.eye, target: add(o.eye, dir), up };
    }
    if (c.mode === 'SOLAR') {                               // Güneş merkezli, ekliptiğe yakın bakış
      const sun = E.sunPos(t), ecl = [0, -0.3977771559, 0.9174820621];
      const xx = [1, 0, 0], y = cross(ecl, xx);
      return { eye: add(sun, scale(fromBasis([xx, y, ecl], sph(c.az, c.el)), c.dist)), target: sun, up: ecl };
    }
    if (c.mode === 'SITE') {
      const s = add(rm, siteIcrf(t)), up = unit(siteIcrf(t));
      const ax = info.drAxis || unit(cross([0, 0, 1], up)), xx = unit(sub(ax, scale(up, dot(ax, up)))), y = cross(up, xx);
      // yer gözlemcisi Güneş tarafında (~180 m); araç kadrajın üstünde, ufuk altında kalacak şekilde
      const obs = add(s, fromBasis([xx, y, up], [-0.125, -0.13, 0.002]));
      const dv = sub(info.vehPos, obs), dh = sub(dv, scale(up, dot(dv, up))), elev = Math.atan2(dot(dv, up), norm(dh));
      const fov = c.userFov ? this.camera.fov : Math.min(60, Math.max(22, (2 * elev * 180) / Math.PI + 12));
      if (!c.userFov && Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
      const lookEl = Math.max(0.02, elev - ((fov / 2 - 5) * Math.PI) / 180 * (elev > 0.05 ? 1 : 0));
      const hdir = unit(dh), tdir = add(scale(hdir, Math.cos(Math.min(lookEl, elev))), scale(up, Math.sin(Math.min(lookEl, elev))));
      return { eye: obs, target: add(obs, tdir), up };
    }
    // VEHICLE: merkez cisme göre yerel dikey çerçeve
    const cen = info.central === 'M' ? rm : [0, 0, 0], vcen = info.central === 'M' ? E.moonVel(t) : [0, 0, 0];
    const z = unit(sub(x.r, cen)), vv = sub(x.v, vcen), xx = unit(sub(vv, scale(z, dot(vv, z)))), y = cross(z, xx);
    return { eye: add(info.vehPos, scale(fromBasis([xx, y, z], sph(c.az, c.el)), c.dist)), target: info.vehPos, up: z };
  }

  autoCamera(x, info) {
    if (this.cam.mode !== 'SITE' && this.cam.mode !== 'OBS' && this.camera.fov !== 50) { this.camera.fov = 50; this.camera.updateProjectionMatrix(); }
    if (!this.cam.auto) return;
    const ph = x.phase, burning = x.thr > 0, rE = norm(x.r), rs = norm(sub(x.r, info.rm));
    let key, set;
    const alt = info.local ? info.local.p[2] : Infinity;
    if (ph === 'INDI') { key = 'LANDED'; set = { mode: 'VEHICLE', dist: 0.028, el: 0.12, az: -2.2 }; }
    else if ((ph === 'YAKLASMA' || ph === 'SON_INIS' || ph === 'PDI') && alt < 0.04) { key = 'SITE'; set = { mode: 'SITE' }; }
    else if ((ph === 'YAKLASMA' || ph === 'SON_INIS' || ph === 'PDI') && alt < 2.5) {
      key = 'VEH_LOW'; set = { mode: 'VEHICLE', dist: 0.045, el: 0.06, az: -2.0 };
    }
    else if (burning || ph === 'PARK' || ph === 'PDI' || ph === 'YAKLASMA' || ph === 'SON_INIS') { key = 'VEH_' + ph; set = { mode: 'VEHICLE', dist: ph === 'PARK' ? 0.05 : 0.06, el: 0.18, az: -2.3 }; }
    else if (ph === 'AY_YORUNGESI' || ph === 'INIS_SUZULME') { key = 'VEH_LLO'; set = { mode: 'VEHICLE', dist: 0.09, el: 0.45, az: -2.6 }; }
    else if (rs < E.MOON_ZONE) { key = 'MOON'; set = { mode: 'MOON', dist: Math.max(7000, 2.4 * rs), el: 0.35, az: 0.6 }; }
    else if (rE < 45000) { key = 'EARTH'; set = { mode: 'EARTH', dist: Math.max(22000, 2.6 * rE), el: 0.35, az: 0.4 }; }
    else { key = 'SYSTEM'; set = { mode: 'SYSTEM', dist: 760000, el: 1.05, az: -1.2 }; }
    if (key !== this.cam.key) {
      Object.assign(this.cam, set); this.cam.key = key;
      if (key === 'MOON' || key === 'EARTH') {         // Güneş'in aydınlattığı yarıdan, aracı da gören bakış
        const cen = key === 'MOON' ? info.rm : [0, 0, 0];
        const d = unit(add(scale(unit(sub(E.sunPos(x.t), cen)), 0.8), scale(unit(sub(x.r, cen)), 0.6)));
        this.cam.az = Math.atan2(d[1], d[0]); this.cam.el = Math.asin(Math.max(-0.9, Math.min(0.9, d[2])));
      }
    }
    if (key === 'MOON') this.cam.dist += (Math.max(7000, 2.4 * rs) - this.cam.dist) * 0.02;
    if (key === 'EARTH') this.cam.dist += (Math.max(22000, 2.6 * rE) - this.cam.dist) * 0.02;
  }

  // ---------------------------------------------------------------- kare güncelle
  update(x, extra) {
    if (!this.ready || !x) return;
    if (this.skyMode) this.setSkyMode(false);
    this.earthU.obsMode.value = 0;
    const t = x.t, rm = E.moonPos(t), sun = E.sunPos(t);
    const central = norm(sub(x.r, rm)) < E.MOON_ZONE ? 'M' : 'E';
    const Mme = E.moonIcrfToMe(t), Mitrf = E.earthIcrfToItrf(t);
    // araç yönelimi (ideal tutum: yakışta itki yönü, süzülmede merkez cisme göre ileri yön; inişte yerel dikey)
    let zDir;
    const landed = x.phase === 'INDI';
    const siteUp = unit(siteIcrf(t));
    if (landed) zDir = siteUp;
    else if (x.thr > 0 && x.u && norm(x.u) > 0) zDir = x.u;
    else if (x.phase === 'SON_INIS' || x.phase === 'YAKLASMA') zDir = siteUp;
    else { const vc = central === 'M' ? sub(x.v, E.moonVel(t)) : x.v; zDir = unit(vc); }
    const refX = central === 'M' ? unit(sub(x.r, rm)) : unit(x.r);
    const target = bodyMatrix(zDir, refX);
    const qT = m3ToQuat(target);
    if (!this.attQ) this.attQ = qT.clone();
    else { const maxA = (extra.dtReal || 0.016) * (x.thr > 0 ? 6.0 : 1.2); const ang = this.attQ.angleTo(qT); this.attQ.slerp(qT, ang > 0 ? Math.min(1, maxA / ang) : 1); }
    const zNow = new THREE.Vector3(0, 0, 1).applyQuaternion(this.attQ);
    // model başvuru noktası: fiziksel nokta = iniş ayakları; model orijini gövde z boyunca 2.9 m yukarıda
    const vehPos = add(x.r, [zNow.x * 0.0029, zNow.y * 0.0029, zNow.z * 0.0029]);
    const info = { rm, central, vehPos, drAxis: extra.drAxis, local: extra.local };
    this.autoCamera(x, info);
    const pose = this.cameraPose(x, info);
    const eye = pose.eye;
    this.eye = eye;
    const rel = (p, v = new THREE.Vector3()) => v.set(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
    // kamera yönü
    const tg = rel(pose.target), up = new THREE.Vector3(...pose.up);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), tg, up);
    this.camera.position.set(0, 0, 0); this.camera.quaternion.setFromRotationMatrix(m);
    this.camera.updateMatrixWorld(true);
    // Güneş
    const sunDir = unit(sub(sun, eye));
    const sd = new THREE.Vector3(...sunDir);
    this.earthU.sunDir.value.copy(unit3(sub(sun, [0, 0, 0])));
    this.moonU.sunDir.value.copy(unit3(sub(sun, rm)));
    this.moonU.earthDir.value.copy(unit3(scale(rm, -1)));
    this.sunSprite.position.copy(sd.clone().multiplyScalar(5e6));
    // Dünya ve Ay
    rel([0, 0, 0], this.earth.position); this.earth.quaternion.copy(m3ToQuat(E.mT(Mitrf)));
    this.atm.position.copy(this.earth.position);
    rel(rm, this.moon.position); this.moon.quaternion.copy(m3ToQuat(E.mT(Mme)));
    if (this.terrain) {
      const sp = add(rm, mtv(Mme, this.terrainSite));
      rel(sp, this.terrain.position); this.terrain.quaternion.copy(this.moon.quaternion);
    }
    // araç
    rel(vehPos, this.vehicle.position); this.vehicle.quaternion.copy(this.attQ);
    const stackOn = x.k === 0;
    this.stackStage.visible = stackOn;
    const thr = x.thr || 0;
    this.flameS.material.uniforms.throttle.value = stackOn ? thr : 0;
    this.flameL.material.uniforms.throttle.value = stackOn ? 0 : thr;
    const dCamVeh = norm(sub(vehPos, eye));
    this.engineLight.intensity = !stackOn && thr > 0 && dCamVeh < 2 ? 0.02 * thr : 0;
    // ayrılan kademe
    if (extra.stage) {
      if (!this.sepAtt) this.sepAtt = this.attQ.clone();
      this.spent.visible = true; rel(extra.stage, this.spent.position); this.spent.quaternion.copy(this.sepAtt);
      this.stageModel.position.set(0, 0, 0);
    } else { this.spent.visible = false; this.sepAtt = null; }
    // tutulma: araç Dünya ya da Ay gölgesindeyse doğrudan Güneş ışığı yok (yarı gölge Güneş'in açısal yarıçapıyla)
    const sv = unit(sub(sun, x.r)), sunAng = 0.00465;
    let lit = 1;
    for (const [c, R] of [[[0, 0, 0], E.R_E], [rm, E.R_M]]) {
      const b = sub(c, x.r), bn = norm(b); if (dot(b, sv) <= 0) continue;
      const sep = Math.acos(Math.max(-1, Math.min(1, dot(b, sv) / bn))), bAng = Math.asin(Math.min(1, R / bn));
      lit = Math.min(lit, Math.max(0, Math.min(1, (sep - (bAng - sunAng)) / (2 * sunAng))));
    }
    this.sunLight.intensity = Math.PI * SUN_I * lit;
    this.ambient.intensity = 0.02 + (central === 'E' && lit < 1 ? 0.05 : 0);
    this.eclipse = lit;
    // gölge (yüzeye yakınken)
    const nearSurf = extra.local && extra.local.p[2] < 3.0;
    this.sunLight.castShadow = !!nearSurf;
    const lt = rel(vehPos);
    this.sunLight.target.position.copy(lt); this.sunLight.position.copy(lt.clone().add(sd.clone().multiplyScalar(0.3)));
    const sc = this.sunLight.shadow.camera; sc.left = -0.06; sc.right = 0.06; sc.top = 0.06; sc.bottom = -0.06; sc.near = 0.01; sc.far = 0.8; sc.updateProjectionMatrix();
    // işaretçiler (uzakta sabit ekran boyu)
    this.vehMarker.visible = dCamVeh > 1.5; rel(x.r, this.vehMarker.position);
    this.stageMarker.visible = !!extra.stage && norm(sub(extra.stage, eye)) > 1.5; if (extra.stage) rel(extra.stage, this.stageMarker.position);
    const siteG = add(rm, siteIcrf(t)); rel(siteG, this.siteMarker.position);
    this.siteMarker.visible = norm(sub(siteG, eye)) > 25 && norm(sub(rm, eye)) < 60000;
    // çizgiler
    this.updateLines(x, t, rm, central, eye, extra);
    // etiketler
    const solarV = this.cam.mode === 'SOLAR';                 // Güneş sistemi görünümünde gezegen etiketleri yeterli
    this.placeLabel('earth', [0, 0, E.R_E * 1.08], norm(eye) > 30000 && !solarV, 0);
    this.placeLabel('moon', add(rm, [0, 0, E.R_M * 1.12]), norm(sub(rm, eye)) > 9000 && !solarV, 0);
    this.placeLabel('veh', x.r, dCamVeh > 1.5 && !solarV, 14);
    this.placeLabel('stage', extra.stage || [0, 0, 0], this.stageMarker.visible, 12);
    this.placeLabel('site', siteG, this.siteMarker.visible, 12);
    this.updateCelestial(t, rm, eye);
    // yıldızlar: aydınlık Ay yüzeyine ya da gündüz Dünya'ya pozlanan kamerada görünmez (Apollo fotoğraflarındaki gibi)
    const onSurface = extra.local && extra.local.p[2] < 30;
    this.stars.material.color.setScalar(onSurface ? 0.08 : 0.55);
    this.central = central; this.info = info;
  }

  // ---------------------------------------------------------------- Canlı Gökyüzü: araçsız, gerçek saatle çizim
  setSkyMode(on) {
    this.skyMode = on;
    for (const o of [this.vehicle, this.vehMarker, this.stageMarker, this.siteMarker, this.osc, this.trailLineE, this.trailLineM, this.stageOsc, this.haloPath, ...this.lMarkers]) o.visible = !on && o !== this.haloPath;
    if (on) { this.spent.visible = false; for (const k of ['veh', 'stage', 'site', 'lp', 'lp2']) if (this.labels[k]) this.labels[k].style.display = 'none'; }
    if (this.skyDome) this.skyDome.visible = false;
  }
  updateSky(t, extra = {}) {
    if (!this.ready) return;
    if (!this.skyMode) this.setSkyMode(true);
    const rm = E.moonPos(t), sun = E.sunPos(t), Mme = E.moonIcrfToMe(t), Mitrf = E.earthIcrfToItrf(t);
    const info = { rm, central: 'E', vehPos: [0, 0, 0] };
    if (this.cam.mode !== 'OBS' && this.cam.mode !== 'SITE' && this.camera.fov !== 50 && !this.cam.userFov) { this.camera.fov = 50; this.camera.updateProjectionMatrix(); }
    const pose = this.cameraPose({ t, r: [0, 0, E.R_E * 3], v: [1, 0, 0] }, info), eye = pose.eye;
    this.eye = eye;
    const rel = (p, v = new THREE.Vector3()) => v.set(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
    const tg = rel(pose.target), up = new THREE.Vector3(...pose.up);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), tg, up);
    this.camera.position.set(0, 0, 0); this.camera.quaternion.setFromRotationMatrix(m); this.camera.updateMatrixWorld(true);
    const sd = new THREE.Vector3(...unit(sub(sun, eye)));
    this.earthU.sunDir.value.copy(unit3(sun)); this.moonU.sunDir.value.copy(unit3(sub(sun, rm))); this.moonU.earthDir.value.copy(unit3(scale(rm, -1)));
    this.sunSprite.position.copy(sd.clone().multiplyScalar(5e6));
    rel([0, 0, 0], this.earth.position); this.earth.quaternion.copy(m3ToQuat(E.mT(Mitrf))); this.atm.position.copy(this.earth.position);
    rel(rm, this.moon.position); this.moon.quaternion.copy(m3ToQuat(E.mT(Mme)));
    if (this.terrain) { rel(add(rm, mtv(Mme, this.terrainSite)), this.terrain.position); this.terrain.quaternion.copy(this.moon.quaternion); }
    this.sunLight.intensity = Math.PI * SUN_I; this.sunLight.castShadow = false; this.ambient.intensity = 0.02; this.eclipse = 1;
    this.sunLight.target.position.set(0, 0, 0); this.sunLight.position.copy(sd);
    // Ay'ın yolu (±4 gün)
    if (!this.moonPathT || Math.abs(t - this.moonPathT) > 3600) { this.moonPathT = t; this.moonPathPts = []; for (let i = 0; i < 600; i++) this.moonPathPts.push(E.moonPos(t - 4 * 86400 + (i * 8 * 86400) / 599)); }
    const ma = this.moonPath.geometry.attributes.position.array;
    this.moonPathPts.forEach((p, i) => { ma[i * 3] = p[0] - eye[0]; ma[i * 3 + 1] = p[1] - eye[1]; ma[i * 3 + 2] = p[2] - eye[2]; });
    this.moonPath.geometry.setDrawRange(0, 600); this.moonPath.geometry.attributes.position.needsUpdate = true;
    this.moonPath.visible = ['EARTH', 'MOON', 'FOCUS'].includes(this.cam.mode) && norm(eye) > 60000;
    // yerden bakış: gündüz gökyüzü (Güneş'in gözlemciye göre yüksekliğine göre)
    const obs = this.cam.mode === 'OBS' && this.obsPose;
    this.earthU.obsMode.value = obs ? 1 : 0;
    if (obs) {
      if (!this.skyDome) { this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(9e6, 32, 16), new THREE.MeshBasicMaterial({ color: 0x3b6fb0, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false }));
        this.skyDome.renderOrder = -9.5; this.skyDome.frustumCulled = false; this.scene.add(this.skyDome); }
      const o = this.obsPose(t), se = Math.asin(Math.max(-1, Math.min(1, dot(unit(sub(sun, o.eye)), o.up)))) * 180 / Math.PI;
      const k = Math.max(0, Math.min(1, (se + 8) / 14));
      this.skyDome.visible = k > 0; this.skyDome.material.opacity = 0.82 * k;
      this.skyDome.material.color.setRGB(0.08 + 0.15 * k, 0.16 + 0.27 * k, 0.32 + 0.37 * k);
      this.skyDome.position.set(0, 0, 0);
      this.stars.material.color.setScalar(0.55 * (1 - k));
    } else { if (this.skyDome) this.skyDome.visible = false; this.stars.material.color.setScalar(0.55); }
    const solarV = this.cam.mode === 'SOLAR' || obs;
    this.placeLabel('earth', [0, 0, E.R_E * 1.08], norm(eye) > 30000 && !solarV, 0);
    const moonUp = !obs || dot(unit(sub(rm, eye)), this.obsPose(t).up) > 0;
    this.placeLabel('moon', add(rm, [0, 0, E.R_M * 1.12]), ((norm(sub(rm, eye)) > 9000 && !this.full) || obs) && moonUp, 0);
    this.updateCelestial(t, rm, eye);
    this.central = 'E'; this.info = info;
  }

  // ---------------------------------------------------------------- kütle merkezi, dönüş eksenleri, Güneş sistemi
  updateCelestial(t, rm, eye) {
    const mode = this.cam.mode, setLine = (l, pts) => {
      const a = l.geometry.attributes.position.array;
      for (let i = 0; i < pts.length; i++) { a[i * 3] = pts[i][0] - eye[0]; a[i * 3 + 1] = pts[i][1] - eye[1]; a[i * 3 + 2] = pts[i][2] - eye[2]; }
      l.geometry.setDrawRange(0, pts.length); l.geometry.attributes.position.needsUpdate = true;
    };
    const emb = scale(rm, K_EMB), embMode = mode === 'EMB' || mode === 'SYSTEM';
    // Dünya ve Ay'ın kütle merkezi etrafındaki yolları (±14 gün, canlı efemeris)
    if (!this.embT || Math.abs(t - this.embT) > 3 * 3600) {
      this.embT = t; this.embPts = [];
      for (let i = 0; i < 400; i++) this.embPts.push(E.moonPos(t - 14 * 86400 + (i * 28 * 86400) / 399));
    }
    this.embEarth.visible = this.embMoon.visible = this.embMarker.visible = embMode;
    if (embMode) {
      setLine(this.embEarth, this.embPts.map((q) => sub(emb, scale(q, K_EMB))));
      setLine(this.embMoon, this.embPts.map((q) => add(emb, scale(q, 1 - K_EMB))));
      this.embMarker.position.set(emb[0] - eye[0], emb[1] - eye[1], emb[2] - eye[2]);
    }
    this.placeLabel('emb', emb, embMode, 10);
    // halo yolu: Ay'a göre (Ay'la birlikte taşınır) ve L1/L2
    const showHalo = !this.skyMode && !!this.haloPts && mode !== 'SOLAR' && norm(sub(rm, eye)) > 12000;
    this.haloPath.visible = showHalo;
    if (showHalo) setLine(this.haloPath, this.haloPts.map((q) => add(rm, q)));
    const showL = !this.skyMode && (embMode || !!this.haloPts) && mode !== 'SOLAR' && norm(sub(rm, eye)) > 30000;
    const lpos = [CR.xL(1), CR.xL(2)].map((xl) => scale(rm, (xl + CR.MU) / 1));
    this.lMarkers.forEach((m, i) => { m.visible = showL; m.position.set(lpos[i][0] - eye[0], lpos[i][1] - eye[1], lpos[i][2] - eye[2]); });
    this.placeLabel('lp', lpos[0], showL, 8); this.placeLabel('lp2', lpos[1], showL, 8);
    // dönüş eksenleri (+ başlangıç meridyeni işareti)
    const far = (c, R) => norm(sub(c, eye)) > 6 * R;
    const showE = mode !== 'OBS' && (mode === 'EARTH' || embMode || (far([0, 0, 0], E.R_E) && mode !== 'SOLAR'));
    const showM = mode !== 'OBS' && (mode === 'MOON' || embMode || (far(rm, E.R_M) && mode !== 'SOLAR'));
    const Mi = E.earthIcrfToItrf(t), pole = Mi[2], mer = Mi[0];
    this.earthAxis.visible = this.earthMer.visible = showE;
    if (showE) { setLine(this.earthAxis, [scale(pole, -1.35 * E.R_E), scale(pole, 1.35 * E.R_E)]); setLine(this.earthMer, [scale(mer, 1.0 * E.R_E), scale(mer, 1.3 * E.R_E)]); }
    const Mm = E.moonIcrfToMe(t), Mp = E.moonIcrfToPa(t);
    this.moonAxis.visible = this.moonMer.visible = showM;
    if (showM) { setLine(this.moonAxis, [add(rm, scale(Mp[2], -1.35 * E.R_M)), add(rm, scale(Mp[2], 1.35 * E.R_M))]); setLine(this.moonMer, [add(rm, scale(Mm[0], E.R_M)), add(rm, scale(Mm[0], 1.35 * E.R_M))]); }
    // Güneş sistemi
    const focusPl = mode === 'FOCUS' && this.cam.focus && (this.cam.focus.kind === 'planet' || this.cam.focus.kind === 'ast');
    this.full = mode === 'SOLAR' || focusPl;
    const obsV = mode === 'OBS';
    const solar = (mode === 'SOLAR' || focusPl || obsV) && this.live;
    for (const pl of this.planets) {
      const on = !!solar && !(obsV && pl.i === 3);
      pl.m.visible = on; pl.o.visible = on && !obsV; if (pl.mesh) pl.mesh.visible = on; if (pl.ring) pl.ring.visible = on;
      if (!on) { pl.d.style.display = 'none'; pl.scr = null; }
    }
    if (solar) {
      const L = this.live.L, et = etOf(t), eS = L.body(3, et), sS = L.body(0, et);
      if (!this.plT || Math.abs(t - this.plT) > 2 * 86400) { this.plT = t; this.plOrb = {}; }
      for (const pl of this.planets) {
        if (obsV && pl.i === 3) continue;
        const [p, v] = L.body(pl.i, et), geo = sub(p, eS[0]);
        pl.m.position.set(geo[0] - eye[0], geo[1] - eye[1], geo[2] - eye[2]);
        pl.geo = geo;
        const dCam = norm(sub(geo, eye)), info = PLANETS[pl.i];
        const appR = info ? info.R / dCam * (this.canvas.clientHeight / 2) / Math.tan(this.camera.fov * Math.PI / 360) : 0;
        pl.appR = appR; pl.m.visible = appR < 5;                       // yakından işaret yerine küre
        if (pl.mesh) {
          pl.mesh.position.copy(pl.m.position); pl.mesh.material.uniforms.sunDir.value.copy(unit3(sub(sS[0], p)));
          planetQuaternion(info, pl.vis, et, pl.mesh.quaternion);                    // IAU dönme fazı: dokudaki özellikler gerçek yerinde
          if (pl.atm) pl.atm.position.copy(pl.m.position);
          if (!pl.texReq && appR >= 6 && this.base != null) {                        // yaklaşınca dokuyu indir
            pl.texReq = true;
            loadPlanetTextures(this.base, pl.vis).then(({ map, ring }) => {
              const u = pl.mesh.material.uniforms;
              if (map) { u.map.value = map; u.hasMap.value = 1; }
              if (ring && pl.ring) { u.ringMap.value = ring; pl.ring.material.uniforms.ringMap.value = ring; }
            });
          }
        }
        if (pl.ring) { pl.ring.position.copy(pl.m.position); const ru = pl.ring.material.uniforms; ru.pc.value.copy(pl.m.position); ru.sunDir.value.copy(pl.mesh.material.uniforms.sunDir.value); }
        if (!this.plOrb[pl.i] && !obsV) {
          const rh = sub(p, sS[0]), vh = sub(v, sS[1]), mu = BODIES[0].gm + BODIES[pl.i].gm;
          const el = E.elements(rh, vh, mu); this.plOrb[pl.i] = conicPoints(el, rh, mu, 1e11, 361).map((q) => add(q, sub(sS[0], eS[0])));
        }
        if (!obsV) setLine(pl.o, this.plOrb[pl.i].map((q) => q));
        const d = pl.d, e = this.eye, vv = new THREE.Vector3(geo[0] - e[0], geo[1] - e[1], geo[2] - e[2]).project(this.camera);
        const below = obsV && this.obsPose && dot(unit(sub(geo, e)), this.obsPose(t).up) < -0.01;      // gözlemcide ufkun altı
        if (below) { pl.m.visible = false; if (pl.mesh) pl.mesh.visible = false; if (pl.ring) pl.ring.visible = false; }
        if (pl.atm) pl.atm.visible = !!(pl.mesh && pl.mesh.visible) && appR >= 3;
        if (below || vv.z > 1 || Math.abs(vv.x) > 1.1 || Math.abs(vv.y) > 1.1) { d.style.display = 'none'; pl.scr = null; }
        else { const sx = ((vv.x + 1) / 2) * this.canvas.clientWidth, sy = ((1 - vv.y) / 2) * this.canvas.clientHeight;
          pl.scr = [sx, sy]; d.style.display = 'block'; d.style.transform = `translate(${sx}px, ${sy - 10 - Math.min(pl.appR || 0, 400)}px) translate(-50%, -100%)`; }
      }
    }
    // Güneş görüntüsü gerçek konumunda (uzaklık uzak düzlemin içinde)
    const sg = E.sunPos(t);
    if (mode === 'SOLAR' || focusPl) this.sunSprite.position.set(sg[0] - eye[0], sg[1] - eye[1], sg[2] - eye[2]);
  }

  updateLines(x, t, rm, central, eye, extra) {
    // anlık (oskülatör) yörünge: merkez cisme göre
    const cen = central === 'M' ? rm : [0, 0, 0], vcen = central === 'M' ? E.moonVel(t) : [0, 0, 0];
    const mu = central === 'M' ? E.MU_M : E.MU_E;
    const r = sub(x.r, cen), v = sub(x.v, vcen), el = E.elements(r, v, mu);
    const pts = conicPoints(el, r, mu, central === 'M' ? 60000 : 1.2e6, 721);
    const oa = this.osc.geometry.attributes.position.array;
    for (let i = 0; i < pts.length; i++) { oa[i * 3] = pts[i][0] + cen[0] - eye[0]; oa[i * 3 + 1] = pts[i][1] + cen[1] - eye[1]; oa[i * 3 + 2] = pts[i][2] + cen[2] - eye[2]; }
    this.osc.geometry.setDrawRange(0, pts.length); this.osc.geometry.attributes.position.needsUpdate = true;
    this.osc.material.color.set(central === 'M' ? 0xc88cff : (el.e < 1 ? 0x49b6ff : 0xff8a3d));
    this.osc.visible = x.phase !== 'INDI' && !(extra.local && extra.local.p[2] < 20);
    this.oscEl = { ...el, central };
    // iz: Dünya merkezli ve Ay merkezli ayrı (Ay yörüngesi Ay'la birlikte taşınır); noktalar fizik worker'ından gelir
    const T = this.trail;
    if (T.E.length > 39000) T.E.splice(0, 1000); if (T.M.length > 39000) T.M.splice(0, 1000);
    const fill = (line, arr, off) => {
      const a = line.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i++) { a[i * 3] = arr[i][0] + off[0] - eye[0]; a[i * 3 + 1] = arr[i][1] + off[1] - eye[1]; a[i * 3 + 2] = arr[i][2] + off[2] - eye[2]; }
      const n = arr.length;
      if (n) { const lp = central === (line === this.trailLineM ? 'M' : 'E') ? x.r : null;
        if (lp) { a[n * 3] = lp[0] - eye[0]; a[n * 3 + 1] = lp[1] - eye[1]; a[n * 3 + 2] = lp[2] - eye[2]; } line.geometry.setDrawRange(0, lp ? n + 1 : n); }
      else line.geometry.setDrawRange(0, 0);
      line.geometry.attributes.position.needsUpdate = true;
    };
    fill(this.trailLineE, T.E, [0, 0, 0]); fill(this.trailLineM, T.M, rm);
    const nearGround = extra.local && extra.local.p[2] < 20;
    this.trailLineM.visible = !nearGround; this.trailLineE.visible = !nearGround;
    // Ay'ın yolu (±4 gün)
    if (!this.moonPathT || Math.abs(t - this.moonPathT) > 3600) {
      this.moonPathT = t; this.moonPathPts = [];
      for (let i = 0; i < 600; i++) this.moonPathPts.push(E.moonPos(t - 4 * 86400 + (i * 8 * 86400) / 599));
    }
    const ma = this.moonPath.geometry.attributes.position.array;
    this.moonPathPts.forEach((p, i) => { ma[i * 3] = p[0] - eye[0]; ma[i * 3 + 1] = p[1] - eye[1]; ma[i * 3 + 2] = p[2] - eye[2]; });
    this.moonPath.geometry.setDrawRange(0, 600); this.moonPath.geometry.attributes.position.needsUpdate = true;
    this.moonPath.visible = !['EMB', 'SYSTEM', 'SOLAR'].includes(this.cam.mode) && (norm(eye) > 60000 || (norm(sub(rm, eye)) > 30000 && central === 'E'));
  }

  planetName(i) { return PLANETS[i] ? PLANETS[i].name : BODIES[i].name; }
  pickPlanet(mx, my) {
    let best = null;
    for (const pl of this.planets) {
      if (!pl.scr || (!PLANETS[pl.i] && pl.i !== 3)) continue;
      const d = Math.hypot(pl.scr[0] - mx, pl.scr[1] - my), lim = Math.max(14, pl.appR || 0);
      if (d <= lim && (!best || d < best.d)) best = { kind: 'planet', i: pl.i, d };
    }
    return best;
  }
  placeLabel(k, p, vis, dy) {
    const d = this.labels[k]; if (!d) return;
    if (!vis) { d.style.display = 'none'; return; }
    const e = this.eye, v = new THREE.Vector3(p[0] - e[0], p[1] - e[1], p[2] - e[2]).project(this.camera);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { d.style.display = 'none'; return; }
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    d.style.display = 'block'; d.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h - dy}px) translate(-50%, -100%)`;
  }

  render() { if (this.ready) this.renderer.render(this.scene, this.camera); }
}

function unit3(a) { const u = unit(a); return new THREE.Vector3(u[0], u[1], u[2]); }

// oskülatör konik noktaları (merkeze göre)
export function conicPoints(el, r, mu, rMax, n) {
  const e = el.e, p = el.p, W = unit(el.h);
  const Pv = e > 1e-8 ? scale(el.evec, 1 / e) : unit(r), Qv = cross(W, Pv);
  let nu0, nu1;
  if (e < 1 && p / (1 - e) <= rMax) { nu0 = 0; nu1 = 2 * Math.PI; }
  else {
    let lim = Math.acos(Math.max(-1, Math.min(1, (p / rMax - 1) / e)));
    if (e >= 1) lim = Math.min(lim, Math.acos(-1 / e) - 1e-3);
    nu0 = -lim; nu1 = lim;
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    const nu = nu0 + ((nu1 - nu0) * i) / (n - 1), rr = p / (1 + e * Math.cos(nu));
    out.push(add(scale(Pv, rr * Math.cos(nu)), scale(Qv, rr * Math.sin(nu))));
  }
  return out;
}
