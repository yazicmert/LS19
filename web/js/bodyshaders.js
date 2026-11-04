// Dünya, Ay ve atmosfer gölgelendiricileri (scene.js'ten ayrıldı). VS_BODY: küre ve yüzey parçaları için ortak köşe gölgelendirici (LOLA yükseklik,
// logaritmik derinlik); FS_EARTH: gündüz/gece, bulut, okyanus parıltısı, yakın ayrıntı, parça geçişi; FS_MOON: Hapke benzeri albedo, WAC/Kaguya parçaları.
import { GLSL_NOISE } from './planets.js';

export const VS_BODY = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform sampler2D heightMap; uniform vec2 hSize; uniform float radius; uniform float useHeight;
attribute vec2 uvT; varying vec2 vUvT;
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
  vUv = uv; vUvT = uvT; vec3 dir = normalize(position); vLocal = dir;
  vec3 p = position;
  if (useHeight > 0.5) p = dir * (radius + hAt(uv));
  vec4 wp = modelMatrix * vec4(p, 1.0); vPos = wp.xyz;
  vN = normalize(mat3(modelMatrix) * dir);
  vec3 e = vec3(-dir.y, dir.x, 0.0); float le = length(e); e = le > 1e-6 ? e / le : vec3(1.0, 0.0, 0.0);
  vE = normalize(mat3(modelMatrix) * e);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

export const FS_EARTH = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D dayMap, nightMap, cloudMap, specMap, normalMap, tileMap; uniform vec3 sunDir; uniform float sunI; uniform float obsMode; uniform float useTile, tileKind;
uniform sampler2D parentMap; uniform vec4 pXf; uniform float pHas, tileFade;          // parça geçişi (tiles.js): ata parça (ya da taban doku) → yeni parça
varying vec2 vUvT;
varying vec3 vN; varying vec3 vE; varying vec3 vPos; varying vec2 vUv; varying vec3 vLocal;
${GLSL_NOISE}
void main() {
  // kaplama parçaları: 1 = JPEG (saf siyah = kapsam yok, ör. okyanus), 2 = PNG (saydam = veri yok): alttaki Blue Marble görünür
  if (useTile > 0.5 && tileKind > 0.5) { vec4 tq = texture2D(tileMap, vUvT); if ((tileKind < 1.5 && tq.r + tq.g + tq.b < 0.012) || (tileKind > 1.5 && tq.a < 0.5)) discard; }
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN), T = normalize(vE), B = cross(N, T);
  vec3 nm = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
  vec3 Np = normalize(T * nm.x * 0.8 + B * nm.y * 0.8 + N * max(nm.z, 0.2));
  vec3 L = normalize(sunDir), V = normalize(-vPos), H = normalize(L + V);
  float ndl = dot(N, L), ndlp = max(dot(Np, L), 0.0);
  float spec = texture2D(specMap, vUv).r;
  // doku çözünürlüğünü (8192 px ≈ 4,9 km) aşan yakınlıkta: kara dokusu ve bulut kenarı için ince ayrıntı
  float magE = smoothstep(0.9, 0.08, useTile > 0.5 ? length(fwidth(vUvT * 512.0)) : length(fwidth(vUv * vec2(8192.0, 4096.0)))), dnE = 0.0, landE = 1.0 - smoothstep(0.1, 0.5, spec);
  if (magE > 0.001) { dnE = (fbm(vLocal * 600.0) - 0.5) * 0.5 + (fbm(vLocal * 2600.0) - 0.5) * 0.35 + (fbm(vLocal * 11000.0) - 0.5) * 0.15; ndlp *= 1.0 + dnE * 0.7 * magE * landE; }
  float magC = smoothstep(0.9, 0.08, length(fwidth(vUv * vec2(8192.0, 4096.0))));        // bulut dokusu kendi çözünürlüğünü aştıkça seyrelir: yer ayrıntısı bulanık lekelerin altında kalmasın
  float cloud = texture2D(cloudMap, vUv).r + dnE * 0.4 * magE; cloud = smoothstep(0.08, 0.9, cloud) * (1.0 - 0.6 * magC);
  vec3 day = useTile > 0.5 ? texture2D(tileMap, vUvT).rgb : texture2D(dayMap, vUv).rgb;
  if (useTile > 0.5 && tileFade < 0.999) {                                                // yumuşak geçiş: yerinde önceden çizilen kaba görüntüden
    vec4 pq = texture2D(parentMap, vUvT * pXf.xy + pXf.zw); vec3 pc = pHas > 0.5 ? pq.rgb : texture2D(dayMap, vUv).rgb;
    bool pBad = tileKind > 0.5 && (pHas < 0.5 || (tileKind < 1.5 ? pq.r + pq.g + pq.b < 0.012 : pq.a < 0.5));   // kaplamanın atasında veri yok: saydamlıkla belirir
    day = mix(pBad ? day : pc, day, tileFade);
  }
  day *= 1.0 + dnE * 0.5 * magE * landE;
  float tw = smoothstep(-0.12, 0.2, ndl);
  vec3 sunCol = mix(vec3(1.0, 0.55, 0.3), vec3(1.0), smoothstep(0.0, 0.35, ndl));
  vec3 col = day * ndlp * sunCol * tw;
  float nh = max(dot(N, H), 0.0), glint = spec * (pow(nh, 400.0) * 1.15 + pow(nh, 40.0) * 0.1);                // okyanus Güneş parıltısı: küçük, parlak çekirdek ve ince hâle (geniş, patlak bir leke değil)
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
  gl_FragColor = vec4(col * sunI, tileKind > 0.5 && pHas < 0.5 ? tileFade : 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const VS_ATM = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN; varying vec3 vPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0); vPos = wp.xyz; vN = normalize(mat3(modelMatrix) * normalize(position));
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
export const FS_ATM = /* glsl */`
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

export const FS_MOON = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D colorMap, normalMap, tileMap; uniform vec3 sunDir, earthDir; uniform float sunI, holeCos, albScale, useTile, lodDelta, tileAlpha, latCut, tilePull; uniform vec3 siteDir;
uniform sampler2D parentMap; uniform vec4 pXf; uniform float pHas, tileFade;          // parça geçişi (tiles.js)
varying vec2 vUvT;
varying vec3 vN; varying vec3 vE; varying vec3 vPos; varying vec2 vUv; varying vec3 vLocal;
${GLSL_NOISE}
void main() {
  if (dot(normalize(vLocal), siteDir) > holeCos) discard;
  #include <logdepthbuf_fragment>
  // parçalar taban ağının (kaba, LOLA yer değiştirmeli üçgenler) çukur yerlerde yüzeyin üstüne çıkıp onları örtmesin: log-derinlikte kameraya doğru ölçekten bağımsız çekme
  #ifdef USE_LOGDEPTHBUF
  gl_FragDepth = max(gl_FragDepth - tilePull * logDepthBufFC * 0.5, 0.0);
  #endif
  vec3 N = normalize(vN), T = normalize(vE), B = cross(N, T);
  vec3 nm = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
  vec3 Np = normalize(T * nm.x + B * nm.y + N * max(nm.z, 0.2));
  vec3 L = normalize(sunDir), V = normalize(-vPos);
  float mu0 = max(dot(Np, L), 0.0), mu = max(dot(N, V), 0.05);
  float I = mix(mu0, 2.0 * mu0 / (mu0 + mu + 1e-4), 0.45);
  vec3 alb = texture2D(colorMap, vUv).rgb * albScale;
  // yüksek çözünürlüklü WAC parçası: taban rengi korunur, parçanın taban çözünürlüğünün altındaki yerel kontrastı (krater, ışın, gölge) eklenir
  if (useTile > 0.5) {
    vec4 tt = texture2D(tileMap, vUvT); if (tileAlpha > 0.5 && (tt.a < 0.5 || abs(vLocal.z) > latCut)) discard;                      // kapsam dışı (saydam) yerde alttaki WAC görünür
    float tl = tt.r, tc = textureLod(tileMap, vUvT, lodDelta).r;
    if (tileFade < 0.999) {                                                               // yumuşak geçiş: ata parçadan (yoksa taban: oran 1; kaplama ise saydamlıkla)
      vec4 pq = texture2D(parentMap, vUvT * pXf.xy + pXf.zw); bool pBad = pHas < 0.5 || (tileAlpha > 0.5 && pq.a < 0.5);
      tl = mix(pBad ? (tileAlpha > 0.5 ? tl : tc) : pq.r, tl, tileFade);
    }
    alb *= clamp(tl / max(tc, 0.03), 0.3, 3.0);
  }
  // renk dokusunun çözünürlüğünü (8192 px ≈ 1,06 km) aşan yakınlıkta: regolit tanesi ve küçük krater kabartması
  float magM = smoothstep(0.9, 0.08, useTile > 0.5 ? length(fwidth(vUvT * 256.0)) : length(fwidth(vUv * vec2(8192.0, 4096.0))));
  if (magM > 0.001) {
    float dn = (fbm(vLocal * 900.0) - 0.5) * 0.5 + (fbm(vLocal * 4200.0) - 0.5) * 0.3 + (fbm(vLocal * 16000.0) - 0.5) * 0.2;
    alb *= 1.0 + dn * 0.5 * magM; I *= 1.0 + dn * 0.9 * magM * (1.0 - 0.5 * mu0);
  }
  vec3 col = alb * I * sunI + alb * 0.012 * max(dot(Np, normalize(earthDir)), 0.0);
  gl_FragColor = vec4(col, tileAlpha > 0.5 && pHas < 0.5 ? tileFade : 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
