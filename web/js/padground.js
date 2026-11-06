// Kalkış zemini: rampa çevresinin iç içe, çok çözünürlüklü uydu görüntüsü ve gerçek kabartması (GEV'in harita yığınından esinle; kalkış canlandırması).
// Tek ağ, tek çizim: rampa çerçevesinde (metre; x doğu, y yukarı, z güney) Dünya eğriliğini izleyen kare ızgara; köşe aralığı rampada ~1 m, kenarda ~200 km
// (üstel aralık). Gölgelendirici her noktada eldeki en ince görüntü seviyesini seçer (z18 ≈ 0,5 m/piksel rampada → z5 ≈ 4 km/piksel ufukta),
// seviye kenarlarında yumuşak geçiş yapar; uzak zemin hava perspektifiyle (pus) gökyüzü rengine karışır, gece alevin ışığı rampayı aydınlatır.
// Görüntü: Esri World Imagery (anahtarsız; atıf ekranda), alamazsa EOX Sentinel-2 cloudless (CC BY-SA 4.0). Kabartma: AWS Terrain Tiles (Terrarium, Mapzen;
// USGS 3DEP/SRTM/GMTED2010/ETOPO1 vb.). Rampa çevresi (≈ 400 m) düz tutulur; rampadan alçak yerler rampa düzeyine kırpılır (fizik rampayı küre yüzeyine koyar,
// taban Dünya küresinin altında kalınmasın). Saf yardımcılar (Mercator, Terrarium çözme, ızgara, yükseklik örnekleme) Node'da sınanır: test/test_padground.js.

export const ZREF = 18;                                   // köşe başına Mercator kayması bu seviyenin karo biriminde saklanır (float32 duyarlığı)
export const LEVELS = [18, 16, 14, 11, 9, 7, 5];         // görüntü seviyeleri (ince → kaba); z12 atlanır: Esri'de geçiş seviyesi, farklı tarihli kaynaklardan yamalı
export const LEVEL_N = 6;                                 // seviye başına N × N karo (256 px) → 1536 px doku
export const HEIGHT_LEVELS = [14, 11, 8, 5];              // Terrarium seviyeleri (her biri 3 × 3 karo)
export const HEIGHT_N = 3;
export const R_M = 6378136.3;                             // küre yarıçapı (m; engine R_E ile aynı)
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- saf yardımcılar
// enlem/boylam (derece) → Web Mercator [0,1) koordinatı (x doğuya, y güneye artar)
export function merc01(lat, lon) {
  const la = Math.max(-85.0511, Math.min(85.0511, lat)) * D2R;
  return [(lon + 180) / 360 - Math.floor((lon + 180) / 360), (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2];
}
// seviye z'de N × N karoluk pencere: rampa ortaya yakın; xc, yc kesirli karo koordinatı
export function levelRect(lat, lon, z, n) {
  const [X, Y] = merc01(lat, lon), s = 2 ** z, xc = X * s, yc = Y * s;
  return { z, n, xc, yc, x0: Math.floor(xc - n / 2 + 0.5), y0: Math.max(0, Math.min(s - n, Math.floor(yc - n / 2 + 0.5))) };
}
// büyük daire üzerinde varış noktası: başlangıç (derece), azimut (radyan, kuzeyden saat yönü), uzaklık d (m)
export function destPoint(lat, lon, az, d, R = R_M) {
  const p1 = lat * D2R, l1 = lon * D2R, a = d / R, sp = Math.sin(p1) * Math.cos(a) + Math.cos(p1) * Math.sin(a) * Math.cos(az);
  const p2 = Math.asin(Math.max(-1, Math.min(1, sp))), l2 = l1 + Math.atan2(Math.sin(az) * Math.sin(a) * Math.cos(p1), Math.cos(a) - Math.sin(p1) * sp);
  return [p2 / D2R, ((l2 / D2R + 540) % 360) - 180];
}
// Terrarium PNG pikselleri (RGBA) → yükseklik (m): h = R·256 + G + B/256 − 32768
export function decodeTerrarium(rgba, out = new Float32Array(rgba.length / 4)) {
  for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = rgba[i] * 256 + rgba[i + 1] + rgba[i + 2] / 256 - 32768;
  return out;
}
// ızgarada çift doğrusal örnekleme (fx, fy piksel; kenarda sıkıştırılır)
export function sampleGrid(g, w, h, fx, fy) {
  const x = Math.max(0, Math.min(w - 1, fx - 0.5)), y = Math.max(0, Math.min(h - 1, fy - 0.5)), x0 = Math.min(Math.floor(x), w - 2), y0 = Math.min(Math.floor(y), h - 2), u = x - x0, v = y - y0, i = y0 * w + x0;
  return (g[i] * (1 - u) + g[i + 1] * u) * (1 - v) + (g[i + w] * (1 - u) + g[i + w + 1] * u) * v;
}
// "veri yok" yer tutucusu mu? (Esri: düz açık gri karo) — örnek pikseller (RGBA dizisi): hepsi neredeyse aynı, doygunluksuz ve açık.
// Düz renkli gerçek karolar (açık deniz) mavidir, elenmez.
export function isPlaceholder(px) {
  let lo = 255, hi = 0, sat = 0;
  for (let i = 0; i < px.length; i += 4) { const r = px[i], g = px[i + 1], b = px[i + 2], m = Math.max(r, g, b), n = Math.min(r, g, b); lo = Math.min(lo, n); hi = Math.max(hi, m); sat = Math.max(sat, m - n); }
  return hi - lo < 8 && sat < 6 && lo > 190;
}
// üstel köşe aralığı: t ∈ [−1, 1] → metre (rampada ince, kenarda kaba)
export const spacing = (t, rMax, k = 12) => Math.sign(t) * rMax * (Math.exp(k * Math.abs(t)) - 1) / (Math.exp(k) - 1);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// yükseklik → rampa çerçevesinde zeminin yüksekliği (m): rampa çevresi düz, rampadan alçak yerler rampa düzeyinde (taban küre altta kalsın), az bir kaldırma
export const groundY = (h, hPad, d) => Math.max(0, h - hPad) * smooth(400, 1400, d) + 0.25;

// ızgara: { lat, lon (derece), nSeg, rMax (m), heightAt(lat, lon) → m | null, hPad } → köşeler (rampa çerçevesi, m), Mercator kayması (ZREF karo birimi), indis
export function buildGround({ lat, lon, nSeg = 192, rMax = 1.65e6, heightAt = null, hPad = 0, R = R_M }) {
  const n = nSeg + 1, pos = new Float32Array(n * n * 3), mxy = new Float32Array(n * n * 2), idx = new Uint32Array(nSeg * nSeg * 6);
  const [Xc, Yc] = merc01(lat, lon), S = 2 ** ZREF, ax = Array.from({ length: n }, (_, i) => spacing(-1 + (2 * i) / nSeg, rMax));
  let k = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++, k++) {
    const e = ax[i], s = ax[j], d = Math.hypot(e, s), az = Math.atan2(e, -s);          // kuzey = −z
    const [la, lo] = d > 0 ? destPoint(lat, lon, az, d, R) : [lat, lon];
    const h = heightAt ? heightAt(la, lo) : null, y = R * Math.cos(d / R) - R + (h == null ? 0.25 : groundY(h, hPad, d)), hr = d > 0 ? (R * Math.sin(d / R)) / d : 1;
    pos[k * 3] = e * hr; pos[k * 3 + 1] = y; pos[k * 3 + 2] = s * hr;
    const [X, Y] = merc01(la, lo); let dX = X - Xc; if (dX > 0.5) dX -= 1; else if (dX < -0.5) dX += 1;
    mxy[k * 2] = dX * S; mxy[k * 2 + 1] = (Y - Yc) * S;
  }
  let q = 0;
  for (let j = 0; j < nSeg; j++) for (let i = 0; i < nSeg; i++) { const a = j * n + i, b = a + 1, c = a + n, dd = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = dd; }
  return { pos, mxy, idx, n };
}
// seviyenin gölgelendirici dönüşümü: uv = (mxy · s + off) / N  (mxy ZREF biriminde; off = rampanın karo içi konumu − pencere başı)
export function levelXf(rect) { const s = 2 ** (rect.z - ZREF); return [s, rect.xc - rect.x0, rect.yc - rect.y0]; }

// ---------------------------------------------------------------- tarayıcı tarafı
const IMAGERY = [
  { name: 'esri', url: (z, x, y) => `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, maxZ: 19 },
  { name: 'eox', url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${z}/${y}/${x}.jpg`, maxZ: 15 },
];
const TERRARIUM = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
export const CREDITS = {
  esri: 'Görüntü: Esri World Imagery — Esri, Maxar, Earthstar Geographics ve GIS kullanıcı topluluğu',
  eox: 'Görüntü: Sentinel-2 cloudless 2016 — s2maps.eu, EOX IT Services GmbH (değiştirilmiş Copernicus Sentinel verisi) · CC BY-SA 4.0',
  dem: 'Yükselti: AWS Terrain Tiles (Mapzen; USGS 3DEP, SRTM, GMTED2010, ETOPO1 ve diğerleri)',
};
const CACHE = 'ls19-tiles-v1';
let cacheP = null;
const openCache = () => (cacheP = cacheP || (typeof caches !== 'undefined' ? caches.open(CACHE).catch(() => null) : Promise.resolve(null)));
async function getBlob(url, signal) {
  const c = await openCache();
  if (c) try { const hit = await c.match(url); if (hit) return await hit.blob(); } catch (e) { /* önbellek isteğe bağlı */ }
  const r = await fetch(url, { mode: 'cors', credentials: 'omit', signal }); if (!r.ok) throw new Error('HTTP ' + r.status);
  if (c) c.put(url, r.clone()).catch(() => {});
  return r.blob();
}
// sınırlı eşzamanlılıkla iş kuyruğu
async function pool(jobs, conc) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, jobs.length) }, async () => { while (i < jobs.length) { const j = jobs[i++]; try { await j(); } catch (e) { /* tek karo eksik kalabilir */ } } })); }
const wrapX = (x, z) => ((x % 2 ** z) + 2 ** z) % 2 ** z;

const VS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec2 mxy; uniform float radius;
varying vec2 vM; varying vec3 vW; varying vec3 vNw; varying vec3 vUpW;
void main() {
  vM = mxy; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz;
  vNw = normalize(mat3(modelMatrix) * normal);
  vUpW = normalize(mat3(modelMatrix) * (position - vec3(0.0, -radius, 0.0)));
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;
const NL = LEVELS.length;
const FS = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
${LEVELS.map((_, k) => `uniform sampler2D t${k}; uniform vec4 L${k};`).join('\n')}
uniform float N; uniform vec3 sunDir; uniform float day, camH, sunI; uniform vec3 plumeW, plumeCol; uniform float plumeI;
varying vec2 vM; varying vec3 vW; varying vec3 vNw; varying vec3 vUpW;
vec4 lvl(sampler2D t, vec4 L) {
  vec2 uv = (vM * L.x + L.yz) / N; float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  vec4 tx = texture2D(t, vec2(uv.x, 1.0 - uv.y), -0.6);              // hafif keskin mip (yatık bakışta şeritlenme az); eksik karo saydam: kaba seviye görünür
  return vec4(tx.rgb, L.w * smoothstep(0.0, 0.16, e) * smoothstep(0.5, 0.95, tx.a));     // geniş geçiş: Esri seviyeleri farklı uydu kaynaklarından (renk farkı)
}
void main() {
  #include <logdepthbuf_fragment>
  vec3 col = vec3(0.0); float a = 0.0; vec4 c;
  ${LEVELS.map((_, k) => `c = lvl(t${NL - 1 - k}, L${NL - 1 - k}); col = mix(col, c.rgb, c.a); a = max(a, c.a);`).join('\n  ')}
  if (a < 0.01) discard;
  col /= max(a, 1e-3);
  // aydınlanma: görüntüde gölge zaten var — kabartmanın düzlemden farkı (yamaç) ve Güneş yüksekliği; gece alevin ışığı
  vec3 L = normalize(sunDir), Nf = normalize(vUpW), Nt = normalize(vNw);
  float sf = max(dot(Nf, L), 0.0), st = max(dot(Nt, L), 0.0), relief = (0.35 + 0.65 * st) / (0.35 + 0.65 * sf);
  float sunAmt = smoothstep(-0.08, 0.25, dot(Nf, L));
  vec3 lit = col * (0.04 + 0.96 * sunAmt) * mix(1.0, relief, 0.8) * mix(vec3(1.0, 0.72, 0.5), vec3(1.0), smoothstep(0.0, 0.3, sf));
  float dp = distance(vW, plumeW); lit += col * plumeCol * plumeI / (1.0 + dp * dp / 0.04);
  // hava perspektifi: pus alçak katmanda (ölçek yüksekliği H ≈ 2 km) yoğun. Işının deniz düzeyi eşdeğeri yolu = H·(1 − e^(−h/H)) / sin(görüş açısı)
  // (yerdeki kamerada bu uzaklığın kendisi; yüksekten aşağı bakınca kısa, ufka doğru uzun); sönüm uzunluğu L0 ≈ 22 km
  float dist = length(vW), sinE = max(dot(normalize(-vW), Nf), 0.02), H = 2.0;
  float path = min(dist, H * (1.0 - exp(-max(camH, 0.0) / H)) / sinE + (camH < 0.05 ? dist : 0.0)), hz = (1.0 - exp(-path / 22.0)) * 0.92;
  vec3 hazeC = mix(vec3(0.015, 0.02, 0.035), vec3(0.62, 0.72, 0.86), day);
  gl_FragColor = vec4(mix(lit * sunI, hazeC, hz), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class PadGround {
  // THREE: three.js modülü · parent: rampa grubu (ölçek KM, birim m) · site: { lat, lon }
  constructor(THREE, parent, site, { onProgress } = {}) {
    this.T = THREE; this.site = site; this.onProgress = onProgress; this.ctl = new AbortController(); this.provider = null; this.hasDem = false; this.ready = false;
    const u = { N: { value: LEVEL_N }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, day: { value: 1 }, camH: { value: 0 }, sunI: { value: 1.25 }, radius: { value: R_M },
      plumeW: { value: new THREE.Vector3() }, plumeCol: { value: new THREE.Color(1, 0.6, 0.3) }, plumeI: { value: 0 } };
    this.rects = LEVELS.map((z) => levelRect(site.lat, site.lon, z, LEVEL_N));
    this.rects.forEach((r, k) => { const [s, ox, oy] = levelXf(r); u['t' + k] = { value: null }; u['L' + k] = { value: new THREE.Vector4(s, ox, oy, 0) }; });
    this.u = u;
    const g = this.geometry(null, 0);
    // saydam geçişte, gökyüzü kubbesinden (renderOrder −9) SONRA çizilir (çıkış alfası 1): yoksa yarı saydam kubbe, yarıçapının ötesindeki zemini griye boyar
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: true }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -1; this.mesh.visible = false; parent.add(this.mesh);
  }
  geometry(heightAt, hPad) {
    const T = this.T, G = buildGround({ lat: this.site.lat, lon: this.site.lon, heightAt, hPad }), g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(G.pos, 3)); g.setAttribute('mxy', new T.BufferAttribute(G.mxy, 2)); g.setIndex(new T.BufferAttribute(G.idx, 1));
    g.computeVertexNormals(); g.boundingSphere = new T.Sphere(new T.Vector3(), 3e6); return g;
  }
  // görüntü ve kabartmayı indir: kaba seviyeler önce (hemen bir zemin görünsün), ince seviyeler sonra; kabartma paralel
  async load() {
    const dem = this.loadDem().catch(() => null);
    for (const prov of IMAGERY) {
      let okAny = false;
      for (let k = LEVELS.length - 1; k >= 0; k--) {
        if (this.ctl.signal.aborted) return false;
        const r = this.rects[k]; if (r.z > prov.maxZ) continue;
        const tex = await this.loadLevel(prov, r);
        if (tex) { const U = this.u; if (U['t' + k].value) U['t' + k].value.dispose(); U['t' + k].value = tex; U['L' + k].value.w = 1; okAny = true; this.provider = this.provider || prov.name; this.mesh.visible = true; this.ready = true; if (this.onProgress) this.onProgress(this); }
        else if (!okAny) break;                                                    // ilk (en kaba) seviye bile gelmediyse bu kaynağı bırak
      }
      if (okAny) break;
    }
    await dem;
    return this.ready;
  }
  async loadLevel(prov, r) {
    const T = this.T, n = r.n, cv = document.createElement('canvas'); cv.width = cv.height = n * 256; const g = cv.getContext('2d', { willReadFrequently: true }); let got = 0;
    const jobs = []; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) jobs.push(async () => {
      const b = await getBlob(prov.url(r.z, wrapX(r.x0 + i, r.z), r.y0 + j), this.ctl.signal);
      const bm = await createImageBitmap(b); g.drawImage(bm, i * 256, j * 256); if (bm.close) bm.close();
      const sm = g.getImageData(i * 256 + 8, j * 256 + 8, 240, 240).data, pts = new Uint8ClampedArray(64);           // 16 örnek piksel
      for (let k = 0; k < 16; k++) { const o = (((k >> 2) * 76 + 10) * 240 + (k & 3) * 76 + 10) * 4; pts.set(sm.subarray(o, o + 4), k * 4); }
      if (isPlaceholder(pts)) { g.clearRect(i * 256, j * 256, 256, 256); return; }                                  // veri yok: saydam bırak
      got++;
    });
    await pool(jobs, 8);
    if (got < n * n * 0.5) return null;
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter; t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    return t;
  }
  // Terrarium kabartması: her seviyede 3 × 3 karo → yükseklik ızgarası; ağ yeniden kurulur (rampa yüksekliği hPad ızgaranın en incesinden)
  async loadDem() {
    const grids = [];
    for (const z of HEIGHT_LEVELS) {
      const r = levelRect(this.site.lat, this.site.lon, z, HEIGHT_N), W = HEIGHT_N * 256, grid = new Float32Array(W * W); let got = 0;
      const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
      const g = cv.getContext('2d', { willReadFrequently: true });
      const jobs = []; for (let j = 0; j < HEIGHT_N; j++) for (let i = 0; i < HEIGHT_N; i++) jobs.push(async () => {
        const b = await getBlob(TERRARIUM(z, wrapX(r.x0 + i, z), r.y0 + j), this.ctl.signal);
        const bm = await createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        g.clearRect(0, 0, 256, 256); g.drawImage(bm, 0, 0); if (bm.close) bm.close();
        const h = decodeTerrarium(g.getImageData(0, 0, 256, 256).data);
        for (let y = 0; y < 256; y++) grid.set(h.subarray(y * 256, y * 256 + 256), (j * 256 + y) * W + i * 256);
        got++;
      });
      await pool(jobs, 6);
      if (got === HEIGHT_N * HEIGHT_N) grids.push({ z, r, W, grid });
    }
    if (!grids.length || this.ctl.signal.aborted) return;
    const heightAt = (la, lo) => {
      const [X, Y] = merc01(la, lo);
      for (const G of grids) { const s = 2 ** G.z, fx = (X * s - G.r.x0) * 256, fy = (Y * s - G.r.y0) * 256; if (fx >= 1 && fy >= 1 && fx < G.W - 1 && fy < G.W - 1) return sampleGrid(G.grid, G.W, G.W, fx, fy); }
      return null;
    };
    const hPad = heightAt(this.site.lat, this.site.lon) ?? 0;
    const old = this.mesh.geometry; this.mesh.geometry = this.geometry(heightAt, hPad); old.dispose();
    this.heightAt = heightAt;
    this.hasDem = true; this.hPad = hPad; if (this.onProgress) this.onProgress(this);
  }
  // rampa çerçevesinde (doğu e, güney s; m) zeminin yüksekliği (m; kabartma yoksa 0,25): yer kameraları yamacın içinde kalmasın
  groundAt(e, s) {
    if (!this.heightAt) return 0.25;
    const d = Math.hypot(e, s), [la, lo] = d > 0 ? destPoint(this.site.lat, this.site.lon, Math.atan2(e, -s), d) : [this.site.lat, this.site.lon], h = this.heightAt(la, lo);
    return h == null ? 0.25 : groundY(h, this.hPad || 0, d);
  }
  credit() { return this.provider ? CREDITS[this.provider] + (this.hasDem ? ' · ' + CREDITS.dem : '') : ''; }
  // her kare: o (ascentFrame durumu), plumeW (alev tabanı, dünya km), thr
  frame({ sunDir, sunUp, h, plumeW, thr, plumeCol }) {
    const U = this.u; if (sunDir) U.sunDir.value.set(sunDir[0], sunDir[1], sunDir[2]);
    U.day.value = Math.max(0, Math.min(1, (sunUp + 0.1) / 0.35)); U.camH.value = h || 0;
    if (plumeW) U.plumeW.value.copy(plumeW); U.plumeI.value = (thr || 0) * (0.5 + 1.3 * (1 - U.day.value)); if (plumeCol) U.plumeCol.value.copy(plumeCol);   // gece belirgin
  }
  dispose() {
    this.ctl.abort();
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
    for (let k = 0; k < LEVELS.length; k++) { const t = this.u['t' + k].value; if (t) t.dispose(); }
  }
}
