// Gezegen yüzeyleri: gerçek dokular (Solar System Scope CC BY 4.0, Plüton için NASA/JHUAPL/SwRI New Horizons), IAU dönme fazı,
// kabartma (dokunun parlaklığından), zoom'da ince ayrıntı, terminatör, kenar kararması, atmosfer ışıması ve Satürn halkasının
// gerçek dokusu / gölgesi. Dokular gezegene yaklaşılınca indirilir (ilk açılışa eklenmez).
import * as THREE from 'three';

const D2R = Math.PI / 180;
// W: IAU yön parametreleri (başlangıç meridyeni, derece ve derece/gün, J2000'den); bump: kabartma yüksekliği (km); limb: kenar kararması;
// term: terminatör yumuşaklığı; atm: [renk, güç, üs, kabuk kalınlığı (R oranı)]; gain: parlaklık
export const PLANET_VIS = {
  1: { tex: 'mercury.jpg', W: [329.5988, 6.1385108], bump: 7, detail: 1, limb: 0.0, term: 0.0, gain: 1.7 },
  2: { tex: 'venus.jpg', W: [160.20, -1.4813688], bump: 0, detail: 0, limb: 0.35, term: 0.45, gain: 1.45, atm: [[1.0, 0.82, 0.45], 0.8, 2.4, 0.02] },
  5: { tex: 'mars.jpg', W: [176.630, 350.89198226], bump: 16, detail: 1, limb: 0.0, term: 0.0, gain: 1.7, atm: [[0.95, 0.62, 0.42], 0.35, 3.2, 0.009] },
  6: { tex: 'jupiter.jpg', W: [284.95, 870.5360000], bump: 0, detail: 0, limb: 0.55, term: 0.05, gain: 1.5, atm: [[0.88, 0.78, 0.62], 0.25, 3.0, 0.006] },
  7: { tex: 'saturn.jpg', W: [38.90, 810.7939024], bump: 0, detail: 0, limb: 0.5, term: 0.05, gain: 1.55, atm: [[0.92, 0.83, 0.62], 0.22, 3.0, 0.006], ringTex: 'saturn_ring.png' },
  8: { tex: 'uranus.jpg', W: [203.81, -501.1600928], bump: 0, detail: 0, limb: 0.4, term: 0.05, gain: 1.45, atm: [[0.55, 0.88, 0.92], 0.55, 2.8, 0.008] },
  9: { tex: 'neptune.jpg', W: [249.978, 541.1397757], bump: 0, detail: 0, limb: 0.45, term: 0.05, gain: 1.5, atm: [[0.3, 0.5, 1.0], 0.6, 2.8, 0.008] },
  10: { tex: 'pluto.jpg', W: [302.695, 56.3625225], bump: 5, detail: 1, limb: 0.0, term: 0.0, gain: 1.7, atm: [[0.45, 0.62, 1.0], 0.22, 3.4, 0.02] },
};

// ortak gürültü (hash, değer gürültüsü, fraktal) — Dünya/Ay gölgelendiricileri de kullanır
export const GLSL_NOISE = /* glsl */`
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

const VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN; varying vec3 vPos; varying vec3 vL; varying vec2 vUv;
void main() {
  vUv = uv; vL = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0); vPos = wp.xyz; vN = normalize(mat3(modelMatrix) * vL);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

const FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map, ringMap;
uniform float hasMap, bump, detail, limb, term, gain, atmK, atmP, ringOn, ringIn, ringOut, uR, bands;
uniform vec3 color, sunDir, pole, atmC, ringN;
varying vec3 vN; varying vec3 vPos; varying vec3 vL; varying vec2 vUv;
${GLSL_NOISE}
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN), L = normalize(sunDir), V = normalize(-vPos);
  vec3 alb;
  if (hasMap > 0.5) alb = texture2D(map, vUv).rgb;
  else { float lat = asin(clamp(dot(N, pole), -1.0, 1.0)); alb = color * (1.0 + bands * (0.16 * sin(lat * 17.0) + 0.09 * sin(lat * 43.0 + 1.3) + 0.05 * sin(lat * 97.0))); }
  float h = dot(alb, vec3(0.299, 0.587, 0.114));
  // dokunun çözünürlüğünü aşan yakınlıkta: kum/krater benzeri ince ayrıntı (doku piksel başına ne kadar texel)
  float tpp = length(fwidth(vUv * vec2(4096.0, 2048.)));
  float mag = smoothstep(0.9, 0.12, tpp) * detail * hasMap;
  if (mag > 0.001) {
    float dn = (fbm(vL * 260.0) - 0.5) * 0.55 + (fbm(vL * 1100.0) - 0.5) * 0.45;
    alb *= 1.0 + dn * 0.5 * mag; h += dn * 0.12 * mag;
  }
  vec3 Np = N;
  if (bump > 0.0 && hasMap > 0.5) {                                  // parlaklıktan türetilen kabartma (Mikkelsen); bump km cinsinden yükseklik
    vec3 dpx = dFdx(vPos), dpy = dFdy(vPos); float dhx = dFdx(h), dhy = dFdy(h);
    vec3 r1 = cross(dpy, N), r2 = cross(N, dpx); float det = dot(dpx, r1);
    Np = normalize(abs(det) * N - bump * sign(det) * (dhx * r1 + dhy * r2));
  }
  float ndl = dot(N, L), ndlp = dot(Np, L);
  float lit = clamp((ndlp + term) / (1.0 + term), 0.0, 1.0);
  lit *= smoothstep(-0.02 - term * 0.5, 0.12 + term * 0.4, ndl);
  vec3 sunCol = mix(vec3(1.0, 0.78, 0.6), vec3(1.0), smoothstep(0.0, 0.35, ndl));
  vec3 col = alb * lit * mix(vec3(1.0), sunCol, step(0.001, atmK));
  float mu = max(dot(N, V), 0.0);
  col *= mix(1.0, 0.3 + 0.7 * pow(mu, 0.6), limb);                    // kenar kararması (gaz devleri)
  if (ringOn > 0.5) {                                                // halkanın gezegen üzerindeki gölgesi
    vec3 P = N * uR; float dn2 = dot(L, ringN);
    if (abs(dn2) > 1e-3) { float t = -dot(P, ringN) / dn2;
      if (t > 0.0) { float rr = length(P + t * L);
        if (rr > ringIn && rr < ringOut) { float a = texture2D(ringMap, vec2((rr - ringIn) / (ringOut - ringIn), 0.5)).a; col *= 1.0 - 0.92 * a; } } }
  }
  col += atmC * pow(1.0 - mu, atmP) * atmK * smoothstep(-0.25, 0.3, ndl);   // atmosferin saçtığı ışık, kenarda
  gl_FragColor = vec4(col * gain, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FS_ATM = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 sunDir, atmC; uniform float k, p;
varying vec3 vN; varying vec3 vPos; varying vec3 vL; varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN), V = normalize(-vPos), L = normalize(sunDir);
  float mu = abs(dot(N, V)); float rim = pow(1.0 - mu, p);
  float ndl = dot(N, L);
  vec3 c = mix(atmC * vec3(1.0, 0.55, 0.4), atmC, smoothstep(-0.05, 0.35, ndl));
  gl_FragColor = vec4(c * rim * k * smoothstep(-0.35, 0.25, ndl) * 1.2, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FS_RING = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D ringMap; uniform vec3 sunDir, ringN, pc; uniform float ringIn, ringOut, uR;
varying vec3 vN; varying vec3 vPos; varying vec3 vL; varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  vec3 P = vPos - pc, L = normalize(sunDir), V = normalize(-vPos);
  float rr = length(P), u = clamp((rr - ringIn) / (ringOut - ringIn), 0.0, 1.0);
  vec4 t = texture2D(ringMap, vec2(u, 0.5));
  float cs = dot(ringN, L), side = sign(dot(ringN, V)) * sign(cs);
  float lit = 0.3 + 0.7 * smoothstep(0.0, 0.3, abs(cs));            // alçak Güneş açısında halka sönükleşir
  float a = t.a;
  if (side < 0.0) { lit *= 0.3; a *= 0.85; }                        // aydınlanmayan yüzü: yalnız ileri saçılan ışık
  float along = dot(P, L), shadow = 1.0;                             // gezegenin halka üzerindeki gölgesi
  if (along < 0.0) shadow = mix(0.03, 1.0, smoothstep(uR * 0.985, uR * 1.015, length(P - along * L)));
  gl_FragColor = vec4(t.rgb * lit * shadow * 2.1, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const white = (() => { const d = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); d.needsUpdate = true; return d; })();

export function planetMaterial(info, vis, poleVec) {
  const a = vis.atm;
  return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: {
    map: { value: white }, ringMap: { value: white }, hasMap: { value: 0 }, bump: { value: vis.bump || 0 }, detail: { value: vis.detail || 0 }, limb: { value: vis.limb || 0 },
    term: { value: vis.term || 0 }, gain: { value: vis.gain || 1.5 }, atmK: { value: a ? a[1] : 0 }, atmP: { value: a ? a[2] : 3 }, atmC: { value: new THREE.Color(...(a ? a[0] : [0, 0, 0])) },
    ringOn: { value: 0 }, ringIn: { value: info.ring ? info.ring[0] : 0 }, ringOut: { value: info.ring ? info.ring[1] : 1 }, uR: { value: info.R },
    ringN: { value: poleVec }, bands: { value: info.bands || 0 }, color: { value: new THREE.Color(info.c) }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, pole: { value: poleVec } } });
}

export function atmosphereMesh(info, vis, sphereGeometry, sunDirUniform) {
  const a = vis.atm; if (!a) return null;
  const m = new THREE.Mesh(sphereGeometry(info.R * (1 + a[3]), 128, 64), new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_ATM, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { sunDir: sunDirUniform, atmC: { value: new THREE.Color(...a[0]) }, k: { value: a[1] }, p: { value: a[2] + 0.6 } } }));
  m.frustumCulled = false; m.visible = false; return m;
}

export function ringMaterial(info, poleVec) {
  return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_RING, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    uniforms: { ringMap: { value: white }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, ringN: { value: poleVec }, pc: { value: new THREE.Vector3() }, ringIn: { value: info.ring[0] }, ringOut: { value: info.ring[1] }, uR: { value: info.R } } });
}

// doku indirme (bir kez): { map, ring } -> Promise
const cache = new Map();
export function loadPlanetTextures(base, vis) {
  if (cache.has(vis.tex)) return cache.get(vis.tex);
  const tl = new THREE.TextureLoader();
  const load = (f, srgb = true) => new Promise((res) => tl.load(`${base}textures/planets/${f}`, (t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; res(t);
  }, undefined, () => res(null)));
  const p = Promise.all([load(vis.tex), vis.ringTex ? load(vis.ringTex) : null]).then(([map, ring]) => ({ map, ring }));
  cache.set(vis.tex, p); return p;
}

// gövde -> ICRF dönüşümü (IAU): Rz(α0+90°) · Rx(90°−δ0) · Rz(W), W = W0 + Wdot·gün
const _a = new THREE.Matrix4(), _b = new THREE.Matrix4(), _c = new THREE.Matrix4();
export function planetQuaternion(info, vis, et, q = new THREE.Quaternion()) {
  const d = et / 86400, W = (vis.W[0] + vis.W[1] * d) * D2R;
  const [ra, de] = info.pole;
  _a.makeRotationZ(ra * D2R + Math.PI / 2); _b.makeRotationX(Math.PI / 2 - de * D2R); _c.makeRotationZ(W % (2 * Math.PI));
  return q.setFromRotationMatrix(_a.multiply(_b).multiply(_c));
}
