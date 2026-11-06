// İsteğe bağlı Google Photorealistic 3D Tiles (GEV'deki fotogerçekçi 3B şehirlerin LS19 karşılığı): kalkış canlandırmasında rampa çevresi
// (varsayılan 12 km yarıçap) gerçek 3B binalar, rampa yapıları ve araziyle çizilir; dışında padground.js'in Esri görüntüsü ve kabartması sürer.
// Kullanıcının KENDİ Google Maps Platform anahtarı gerekir (Map Tiles API açık; Google ücretlendirir). Anahtar yalnız bu tarayıcıda (localStorage)
// saklanır ve istekler doğrudan Google'a gider; LS19 sunucusu görmez. Anahtarı Google Cloud Console'da HTTP yönlendiren (referrer) ile kısıtlayın.
// Kütüphane: 3d-tiles-renderer (NASA-AMMOS, Apache-2.0; tools/tiles3d_paketle.mjs ile web/lib/'e paketlenir), Draco çözücü three r170'ten.
// Kütüphaneler yalnız bu katman açılınca indirilir (dinamik import); kapalıyken siteye yük getirmez.
//
// Yerleşim: karolar ECEF (WGS-84, metre); grup matrisi ECEF → rampa çerçevesi (x doğu, y yukarı, z güney; padground.js ile aynı) dönüşümüdür.
// Rampa yüksekliği bilinmediğinden (karolar elipsoit yüksekliğinde, geoit farkı ~±100 m) rampa çevresine aşağı doğru ışın atılır ve zemin y = 0'a
// oturtulur (yeni ince karolar geldikçe yinelenir). Yalnız rampa çevresindeki karolar yüklenir (LoadRegionPlugin maske kürresi); ayrıntı düzeyi kameraya göre.
// Görünüş: karolar fotoğraf (ışığı içinde) olduğundan ışıksız çizilir; padground.js ile aynı gece karartması, alev ışığı ve hava perspektifi (pus)
// gölgelendiriciye eklenir; yarıçap dışı atılır, padground.js aynı yarıçapın içini boşaltır (iki zemin üst üste binmez).
// Atıf: Google'ın karo başına telif dizileri kalkış çubuğunda gösterilir (Google kullanım koşulları; logo/atıf kuralları sitenin sorumluluğundadır).
// Saf yardımcılar (WGS-84, ECEF → rampa matrisi, gölgelendirici yaması, ayarlar) Node'da sınanır: test/test_google3d.js.

export const WGS84_A = 6378137, WGS84_F = 1 / 298.257223563, WGS84_E2 = WGS84_F * (2 - WGS84_F);
export const RADIUS_M = 12000;                         // 3B karoların çizildiği yarıçap (m); dışı Esri zemini
export const MAX_CAM_KM = 25;                          // kamera bu irtifanın üstündeyse karolar kapanır (çok küçük kalır; Esri zemini yeter)
const D2R = Math.PI / 180;
const KEY = 'ls19.g3d.key', ON = 'ls19.g3d.on', URL_KEY = 'ls19.g3d.url';

// ---------------------------------------------------------------- saf yardımcılar
// jeodezik (derece, m) → ECEF (m)
export function geodeticToEcef(lat, lon, h = 0) {
  const p = lat * D2R, l = lon * D2R, sp = Math.sin(p), cp = Math.cos(p), N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sp * sp);
  return [(N + h) * cp * Math.cos(l), (N + h) * cp * Math.sin(l), (N * (1 - WGS84_E2) + h) * sp];
}
// yerel doğu, kuzey, yukarı (jeodezik dikey) birim vektörleri (ECEF eksenlerinde)
export function enu(lat, lon) {
  const p = lat * D2R, l = lon * D2R, sp = Math.sin(p), cp = Math.cos(p), sl = Math.sin(l), cl = Math.cos(l);
  return { east: [-sl, cl, 0], north: [-sp * cl, -sp * sl, cp], up: [cp * cl, cp * sl, sp] };
}
// ECEF → rampa çerçevesi (x doğu, y yukarı, z güney; m) dönüşümü; başlangıç noktası (lat, lon, h0). THREE.Matrix4.elements sırası (sütun öncelikli).
export function ecefToPadMatrix(lat, lon, h0 = 0) {
  const { east: E, north: Nn, up: U } = enu(lat, lon), S = Nn.map((c) => -c), o = geodeticToEcef(lat, lon, h0);
  const rows = [E, U, S], t = rows.map((r) => -(r[0] * o[0] + r[1] * o[1] + r[2] * o[2]));
  return [rows[0][0], rows[1][0], rows[2][0], 0, rows[0][1], rows[1][1], rows[2][1], 0, rows[0][2], rows[1][2], rows[2][2], 0, t[0], t[1], t[2], 1];
}
// yüzde-ilk (alt yüzdelik) — ışın isabetlerinden zemin: rampa yapıları (kule, su kulesi) yükseklik vermesin
export function lowPercentile(xs, q = 0.25) { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }

// three'nin MeshBasic/MeshStandard gölgelendiricilerine yama: ışıksız fotoğraf rengi + padground.js ile aynı gece/alev/pus; yarıçap dışı atılır.
// Değişkenler dünya biriminde (km; kamera başlangıçta). Dönen: yamalandı mı (beklenen işaretler bulunamadıysa false, malzeme olduğu gibi kalır).
export const G3D_UNIFORMS = ['g3Pad', 'g3Up', 'g3R2', 'g3Sun', 'g3Day', 'g3CamH', 'g3SunI', 'g3Plume', 'g3PlumeCol', 'g3PlumeI'];
export function patchShader(sh) {
  const V0 = '#include <common>', V1 = '#include <project_vertex>', F0 = '#include <common>', F1 = '#include <opaque_fragment>';
  if (!sh.vertexShader.includes(V0) || !sh.vertexShader.includes(V1) || !sh.fragmentShader.includes(F0) || !sh.fragmentShader.includes(F1)) return false;
  sh.vertexShader = sh.vertexShader.replace(V0, V0 + '\nvarying vec3 vG3;').replace(V1, V1 + '\nvG3 = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = sh.fragmentShader.replace(F0, F0 + `
varying vec3 vG3; uniform vec3 g3Pad, g3Up, g3Sun, g3Plume, g3PlumeCol; uniform float g3R2, g3Day, g3CamH, g3SunI, g3PlumeI;`).replace(F1, `{
  vec3 rel = vG3 - g3Pad; float dv = dot(rel, g3Up); if (dot(rel, rel) - dv * dv > g3R2) discard;
  vec3 c0 = diffuseColor.rgb, Lw = normalize(g3Sun);
  float sunAmt = smoothstep(-0.08, 0.25, dot(g3Up, Lw)), dp = distance(vG3, g3Plume);
  vec3 lit = c0 * (0.04 + 0.96 * sunAmt) * g3SunI + c0 * g3PlumeCol * g3PlumeI / (1.0 + dp * dp / 0.04);
  float dist = length(vG3), sinE = max(dot(normalize(-vG3), g3Up), 0.02), H = 2.0;
  float path = min(dist, H * (1.0 - exp(-max(g3CamH, 0.0) / H)) / sinE + (g3CamH < 0.05 ? dist : 0.0)), hz = (1.0 - exp(-path / 22.0)) * 0.92;
  outgoingLight = mix(lit, mix(vec3(0.015, 0.02, 0.035), vec3(0.62, 0.72, 0.86), g3Day), hz);
}
` + F1);
  return true;
}

// ayarlar (localStorage; yoksa bellek): { key, on, url } — url: başka bir 3D Tiles kümesi (anahtarsız; geliştirme/deneme)
const mem = {};
const store = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
const get = (k) => { const s = store(); try { return s ? s.getItem(k) : mem[k] ?? null; } catch (e) { return mem[k] ?? null; } };
const put = (k, v) => { const s = store(); try { if (v == null) { if (s) s.removeItem(k); delete mem[k]; } else if (s) s.setItem(k, v); else mem[k] = v; } catch (e) { mem[k] = v; } };
export function g3dSettings() { return { key: get(KEY) || '', on: get(ON) === '1', url: get(URL_KEY) || '' }; }
export function saveG3dSettings({ key, on, url } = {}) {
  if (key !== undefined) put(KEY, key ? String(key).trim() : null);
  if (on !== undefined) put(ON, on ? '1' : null);
  if (url !== undefined) put(URL_KEY, url ? String(url).trim() : null);
  return g3dSettings();
}
export const g3dUsable = (s = g3dSettings()) => s.on && !!(s.key || s.url);

// ---------------------------------------------------------------- tarayıcı tarafı
export class Google3D {
  // THREE · parent: rampa grubu (ölçek KM, birim m) · site { lat, lon } · key | url · renderer, camera · base: site kökü ('lib/…' için)
  constructor({ THREE, parent, site, key = '', url = '', renderer, camera, base = '', radiusM = RADIUS_M, onStatus = null }) {
    Object.assign(this, { T: THREE, parent, site, key, url, renderer, camera, base, radiusM, onStatus });
    this.status = 'idle'; this.ready = false; this.visible = true; this.h0 = 0; this.aligned = false; this.lastAlign = 0; this.errors = 0; this.surf = new Map();
    const V = () => new THREE.Vector3();
    this.u = { g3Pad: { value: V() }, g3Up: { value: new THREE.Vector3(0, 1, 0) }, g3R2: { value: (radiusM / 1000) ** 2 }, g3Sun: { value: new THREE.Vector3(0, 1, 0) },
      g3Day: { value: 1 }, g3CamH: { value: 0 }, g3SunI: { value: 1.25 }, g3Plume: { value: V() }, g3PlumeCol: { value: new THREE.Color(1, 0.6, 0.3) }, g3PlumeI: { value: 0 } };
  }
  setStatus(s, msg = '') { this.status = s; this.msg = msg; if (this.onStatus) this.onStatus(this); }
  async start() {
    const T = this.T;
    if (!this.key && !this.url) { this.setStatus('off'); return false; }
    this.setStatus('loading');
    let L, DRACOLoader;
    try { [L, { DRACOLoader }] = await Promise.all([import('../lib/3d-tiles-renderer.esm.js'), import('three/addons/loaders/DRACOLoader.js')]); }
    catch (e) { this.setStatus('error', 'Google 3B kütüphanesi yüklenemedi'); return false; }
    if (this.disposed) return false;
    const tiles = this.tiles = new L.TilesRenderer(this.url || undefined);
    if (!this.url) tiles.registerPlugin(new L.GoogleCloudAuthPlugin({ apiToken: this.key, autoRefreshToken: true }));
    this.draco = new DRACOLoader().setDecoderPath(this.base + 'lib/addons/libs/draco/gltf/');
    tiles.registerPlugin(new L.GLTFExtensionsPlugin({ dracoLoader: this.draco }));
    const c = geodeticToEcef(this.site.lat, this.site.lon, 0);
    // maske küresi: yalnız rampa çevresindeki karolar; errorTarget çok büyük → bölge ayrıntı zorlamaz, ayrıntı kameraya göre
    tiles.registerPlugin(new L.LoadRegionPlugin({ regions: [new L.SphereRegion({ sphere: new T.Sphere(new T.Vector3(...c), this.radiusM * 1.2), mask: true, errorTarget: 1e9 })] }));
    tiles.registerPlugin(new L.UnloadTilesPlugin());
    tiles.group.matrixAutoUpdate = false; this.applyMatrix(); this.parent.add(tiles.group);
    tiles.setCamera(this.camera); tiles.setResolutionFromRenderer(this.camera, this.renderer);
    tiles.addEventListener('load-model', ({ scene }) => scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) this.patch(m); }));
    tiles.addEventListener('load-error', ({ tile, error }) => {
      this.errors++;
      if (!tile || !tile.parent) this.setStatus('error', /40[13]/.test(String(error && error.message)) ? 'Google 3B: anahtar geçersiz ya da Map Tiles API kapalı' : 'Google 3B karoları alınamadı');
    });
    return true;
  }
  applyMatrix() { if (this.tiles) { this.tiles.group.matrix.fromArray(ecefToPadMatrix(this.site.lat, this.site.lon, this.h0)); this.tiles.group.matrixWorldNeedsUpdate = true; } }
  patch(m) {
    if (m.userData.g3d) return; m.userData.g3d = true;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); if (patchShader(sh)) for (const k of G3D_UNIFORMS) sh.uniforms[k] = this.u[k]; };
    m.customProgramCacheKey = () => 'ls19-g3d-' + m.type; m.needsUpdate = true;
  }
  // her kare (applyAscent): ortak görünüş değerleri padground.js'ten (u: PadGround.u), kamera irtifası (km)
  frame(gu, camH) {
    const U = this.u; if (!this.tiles) return;
    this.visible = camH < MAX_CAM_KM; this.tiles.group.visible = this.visible;
    U.g3Sun.value.copy(gu.sunDir.value); U.g3Day.value = gu.day.value; U.g3CamH.value = camH; U.g3SunI.value = gu.sunI.value;
    U.g3Plume.value.copy(gu.plumeW.value); U.g3PlumeCol.value.copy(gu.plumeCol.value); U.g3PlumeI.value = gu.plumeI.value;
    this.parent.updateMatrixWorld(true);
    U.g3Pad.value.setFromMatrixPosition(this.parent.matrixWorld);
    U.g3Up.value.set(0, 1, 0).transformDirection(this.parent.matrixWorld);
    if (!this.visible || this.status === 'error') return;
    const now = performance.now(), sz = this.renderer.getDrawingBufferSize(this._sz || (this._sz = new this.T.Vector2()));
    if (sz.x !== this._w || sz.y !== this._h) { this._w = sz.x; this._h = sz.y; this.tiles.setResolutionFromRenderer(this.camera, this.renderer); }
    this.tiles.update();
    if (now - this.lastAlign > (this.aligned ? 2500 : 600)) { this.lastAlign = now; this.align(); }
    const ready = this.aligned && this.tiles.loadProgress > 0.6;
    if (ready !== this.ready) { this.ready = ready; this.setStatus(ready ? 'ready' : 'loading'); }
  }
  // rampa çevresine (45–90 m halka) aşağı ışın: zeminin alt çeyreği y = 0'a oturtulur (kule ve yapılar ölçüye girmesin)
  align() {
    const T = this.T, ys = [];
    for (const r of [45, 70, 90]) for (let k = 0; k < 12; k++) { const a = (k / 12) * 2 * Math.PI, y = this.surfaceY(r * Math.cos(a), r * Math.sin(a)); if (y != null) ys.push(y); }
    const y = lowPercentile(ys, 0.25); if (y == null || ys.length < 8) return;
    if (Math.abs(y) > 0.15) { this.h0 += y; this.applyMatrix(); this.surf.clear(); }
    this.aligned = true; void T;
  }
  // rampa çerçevesinde (doğu e, güney s; m) 3B yüzeyin yüksekliği (m) ya da null
  surfaceY(e, s) {
    const T = this.T, rc = this._rc || (this._rc = new T.Raycaster()), P = this.parent;
    P.updateMatrixWorld(true); this.tiles.group.updateMatrixWorld(true);
    const o = P.localToWorld(new T.Vector3(e, 3000, s)), d = P.localToWorld(new T.Vector3(e, 2999, s)).sub(o).normalize();
    rc.set(o, d); rc.far = Infinity;
    const hit = rc.intersectObject(this.tiles.group, true)[0];
    return hit ? P.worldToLocal(hit.point.clone()).y : null;
  }
  // yer kameraları için önbellekli yüzey (5 m ızgara, 3 s)
  surfaceAt(e, s) {
    if (!this.ready) return null;
    const k = Math.round(e / 5) + ':' + Math.round(s / 5), now = performance.now(), c = this.surf.get(k);
    if (c && now - c.t < 3000) return c.y;
    const y = this.surfaceY(e, s); this.surf.set(k, { y, t: now }); if (this.surf.size > 64) this.surf.delete(this.surf.keys().next().value);
    return y;
  }
  attribution() {
    if (!this.tiles || !this.ready || !this.visible) return '';
    const a = []; try { this.tiles.getAttributions(a); } catch (e) { /* eski sürüm */ }
    const s = a.filter((x) => x.type === 'string' && x.value).map((x) => x.value).join('; ');
    return this.url ? `3B karolar: ${this.url}` : s ? `Google 3B karolar — ${s}` : 'Google 3B karolar';
  }
  dispose() {
    this.disposed = true;
    if (this.tiles) { this.parent.remove(this.tiles.group); this.tiles.dispose(); this.tiles = null; }
    if (this.draco) { this.draco.dispose(); this.draco = null; }
  }
}
