// Yüzey ayrıntısı (scene.js'ten ayrıldı; World'e karıştırılır): yakınlaştıkça gelen NASA parçaları (Dünya: GIBS Blue Marble, Landsat WELD, HLS;
// Ay: Trek LRO WAC, Kaguya TC), kaplama kaynağı düğmesi ve durum iletisi, iniş arazisi yamasının yerleşimi.
import * as THREE from 'three';
import * as E from './engine.js';
import { TileLayer } from './tiles.js';
import { VS_BODY, FS_EARTH, FS_MOON } from './bodyshaders.js';
import { add, sub, norm, dot, mtv } from './vec3.js';
import { t } from './i18n.js';
import { groundCovers } from './launchcam.js';

const TERRAIN_FAR_KM = 25000;            // iniş arazisi yamasının (60 km yarıçap) çizildiği en büyük kamera uzaklığı

export class SurfaceView {
  // eu, mu: Dünya ve Ay küresinin gölgelendirici değişkenleri (parçalar aynı gölgelendiriciyi ve ışığı paylaşır)
  buildTiles(eu, mu) {
    // yakınlaştıkça yüksek çözünürlüklü parçalar (NASA GIBS Blue Marble kabartmalı + deniz tabanı · NASA Trek LRO WAC)
    const baseTexel = (R) => 2 * Math.PI * R / 8192;
    this.earthTiles = new TileLayer({ parent: this.earth, R: E.R_E, scheme: 'gibs', tileSize: 512, minZ: 3, maxZ: 7, baseTexelKm: baseTexel(E.R_E), lift: 2e-6, maxTextures: 130, concurrency: 16,
      url: (z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/${z}/${y}/${x}.jpeg`,
      material: (tex) => new THREE.ShaderMaterial({ uniforms: { ...eu, tileMap: { value: tex }, useTile: { value: 1 } }, vertexShader: VS_BODY, fragmentShader: FS_EARTH }) });
    // Dünya kaplamaları (Blue Marble'ın ≈490 m'sinden daha ince): Landsat WELD (30 m, bulutsuz, ~2000) ya da HLS (30 m, güncel, bulutlu); düğmeyle seçilir
    const gibs = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/';
    this.earthWeld = new TileLayer({ parent: this.earth, R: E.R_E, scheme: 'gibs', tileSize: 512, rootZ: 4, minZ: 8, maxZ: 11, baseTexelKm: 2.25 * Math.PI / 180 * E.R_E / 512, lift: 4e-6, maxTextures: 110, concurrency: 16, minBytes: 8000, overlay: true,
      url: (z, x, y) => `${gibs}Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual/default/2000-12-01/31.25m/${z}/${y}/${x}.jpeg`,
      material: (tex) => new THREE.ShaderMaterial({ uniforms: { ...eu, tileMap: { value: tex }, useTile: { value: 1 }, tileKind: { value: 1 } }, vertexShader: VS_BODY, fragmentShader: FS_EARTH }) });
    const hlsDates = () => Array.from({ length: 9 }, (_, k) => new Date(Date.now() - (k + 1) * 864e5).toISOString().slice(0, 10));
    this.earthHls = new TileLayer({ parent: this.earth, R: E.R_E, scheme: 'gibs', tileSize: 512, rootZ: 4, minZ: 8, maxZ: 11, baseTexelKm: 2.25 * Math.PI / 180 * E.R_E / 512, lift: 6e-6, maxTextures: 70, concurrency: 12, minBytes: 3000, noBoost: true, overlay: true,
      urls: (z, x, y) => hlsDates().map((d) => `${gibs}HLS_S30_Nadir_BRDF_Adjusted_Reflectance/default/${d}/31.25m/${z}/${y}/${x}.png`),
      material: (tex) => new THREE.ShaderMaterial({ uniforms: { ...eu, tileMap: { value: tex }, useTile: { value: 1 }, tileKind: { value: 2 } }, vertexShader: VS_BODY, fragmentShader: FS_EARTH }) });
    this.moonTiles = new TileLayer({ parent: this.moon, R: E.R_M, scheme: 'eq', tileSize: 256, minZ: 4, maxZ: 8, baseTexelKm: baseTexel(E.R_M), lift: 0, maxTextures: 260,
      url: (z, x, y) => `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`,
      material: (tex, n) => new THREE.ShaderMaterial({ uniforms: { ...mu, tileMap: { value: tex }, useTile: { value: 1 }, tilePull: { value: 0.0589 }, radius: { value: E.R_M + 0.004 }, lodDelta: { value: Math.min(7, Math.max(0, Math.log2(baseTexel(E.R_M) / n.texelKm))) } },
        vertexShader: VS_BODY, fragmentShader: FS_MOON }) });
    // WAC'in (≈83 m) üstüne SELENE/Kaguya TC ortho mozaiği (≈21 m, yaklaşık 65°K–65°G): yalnız çok yakında; kapsam dışı saydam, orada WAC kalır
    this.moonTiles2 = new TileLayer({ parent: this.moon, R: E.R_M, scheme: 'eq', tileSize: 256, rootZ: 4, minZ: 8, maxZ: 10, latLimit: 58, baseTexelKm: 2 * Math.PI * E.R_M / (256 * 2 ** 9), lift: 0, maxTextures: 200, lodBias: 1.15, overlay: true,
      url: (z, x, y) => `https://trek.nasa.gov/tiles/Moon/EQ/Kaguya_TCortho_Mosaic_Global_4096ppd/1.0.0/default/default028mm/${z}/${y}/${x}.png`,
      material: (tex, n) => new THREE.ShaderMaterial({ uniforms: { ...mu, tileMap: { value: tex }, useTile: { value: 1 }, tileAlpha: { value: 1 }, tilePull: { value: 0.0735 }, latCut: { value: Math.sin(58 * Math.PI / 180) }, radius: { value: E.R_M + 0.009 }, lodDelta: { value: Math.min(7, Math.max(0, Math.log2(baseTexel(E.R_M) / n.texelKm))) } },
        vertexShader: VS_BODY, fragmentShader: FS_MOON }) });
    this.moonTiles2.group.renderOrder = 2;
  }
  // iniş arazisi yaması: yalnız yakınken çizilir; uzakta (yama ~0,25°'nin altında) hem yama hem Ay küresindeki delik kapatılır (yarım milyon üçgen ve delik gölgelendirme işi kalmaz)
  // Ufuk ötesi: yama, kameradan bakışta Ay'ın ufkunun tamamen ötesindeyse görünemez (LLO'da yörüngenin çoğu): çizilmez. Görülebilen bir noktaya
  // giden doğru parçası (R_ay − 10,1) küresine giremez → Ay merkezinden açı ≤ acos(rMin/d) + acos(rMin/rMax); yamanın köşeleri (~85 km) için
  // 0,06 rad pay (köşeler 0,049 rad; bodyband.js ile aynı sınır).
  placeTerrain(rm, Mme, eye, rel) {
    const sp = add(rm, mtv(Mme, this.terrainSite)), ce = sub(eye, rm), sv = sub(sp, rm), dm = norm(ce), rMin = E.R_M - 10.1, rMax = E.R_M + 11.05;
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(ce, sv) / (dm * norm(sv)))));
    const over = !this.noTerrainHorizon && dm > rMin && ang > Math.acos(Math.min(1, rMin / dm)) + Math.acos(rMin / rMax) + 0.06;
    const near = norm(sub(sp, eye)) < TERRAIN_FAR_KM && !over;
    rel(sp, this.terrain.position); this.terrain.quaternion.copy(this.moon.quaternion);
    if (this.terrain.visible !== near) { this.terrain.visible = near; this.moonU.holeCos.value = near ? this.holeCos0 : 2.0; }
  }
  // yüksek çözünürlüklü yüzey parçaları: kamera cisim sabit çerçevesinde
  updateTiles() {
    const cam = this.camera; cam.updateMatrixWorld(true);
    const fov = cam.fov * Math.PI / 180, H = this.canvas.clientHeight || 800, fwdW = cam.getWorldDirection(new THREE.Vector3());
    let pending = 0, failed = 0, loaded = 0, drawn = 0, busy = false;
    let mode = this.earthDetail; if (!mode) { try { mode = localStorage.getItem('ls19.earthdetail'); } catch (e) { mode = null; } this.earthDetail = mode = ['weld', 'hls', 'bm'].includes(mode) ? mode : 'weld'; }
    if (this.earthWeld) { this.earthWeld.userOn = mode === 'weld'; this.earthHls.userOn = mode === 'hls'; }
    // kalkış canlandırmasında rampa çevresini padground.js çizer (ufka dek, kabartmalı): Dünya parçaları onun üstüne binmesin. Taban küre de gizlenir: zemin ağı
    // ~1650 km'ye dek uzanır; küre köşeleri zemine 0,25 m yaklaştığından derinlikte çakışırdı. Ama yalnız kameranın gördüğü yer (altındaki nokta + ufuk) bu
    // karenin içindeyken: kamera uzaklaşınca ya da roket karenin kıyısına varınca zemin gizlenir, gerçek küre ve yüzey parçaları çizilir (yoksa uzaktan
    // bakışta kara bir küre üstünde süzülen bir kare görünürdü). launchcam.js groundCovers
    const AG = this.asc && this.asc.ground, padP = this.asc && this.asc.state && this.asc.state.pad;
    const camE = this.earth.position, eyeE = [-camE.x, -camE.y, -camE.z];               // kamera Dünya merkezine göre (sahne kameraya göre)
    const padGround = !!(AG && AG.ready && padP && this.cam && this.cam.mode === 'LAUNCH' && groundCovers(eyeE, padP.pos, E.R_E));
    if (AG && AG.ready && AG.mesh.visible !== padGround) AG.mesh.visible = padGround;
    if (this.earth.material.visible === padGround) this.earth.material.visible = !padGround;
    for (const [layer, body] of [[this.earthTiles, this.earth], [this.earthWeld, this.earth], [this.earthHls, this.earth], [this.moonTiles, this.moon], [this.moonTiles2, this.moon]]) {
      if (!layer || !body.visible || layer.userOn === false || (padGround && body === this.earth)) { if (layer) layer.setEnabled(false); continue; }
      layer.setEnabled(true);
      const qi = body.quaternion.clone().invert();
      layer.update(body.position.clone().negate().applyQuaternion(qi), fwdW.clone().applyQuaternion(qi), fov, cam.aspect, H);
      pending += layer.stats.pending; failed += layer.stats.failed; loaded += layer.stats.loaded; drawn += layer.stats.drawn; busy = busy || layer.busy;
    }
    this.tilesBusy = busy;                                                                  // parça GPU yüklemesi/geçişi sürüyor: app.js uyarlanır çözünürlüğe bildirir
    // Dünya kaplama kaynağı düğmesi: yalnız Dünya'da ince parçalar devredeyken görünür
    let mb = this.tileModeEl; if (!mb) {
      mb = this.tileModeEl = document.createElement('button'); mb.className = 'tilemode'; mb.hidden = true; document.body.appendChild(mb);
      mb.addEventListener('click', () => { const o = ['weld', 'hls', 'bm']; this.earthDetail = o[(o.indexOf(this.earthDetail) + 1) % 3]; try { localStorage.setItem('ls19.earthdetail', this.earthDetail); } catch (e) { /* */ } this.tileModeTxt = null; });
    }
    const showMode = !padGround && this.earthTiles && this.earthTiles.stats.drawn > 0 && this.earth.visible, label = t({ weld: 'Dünya yüzeyi: Landsat 30 m (bulutsuz, ~2000 görüntüleri)', hls: 'Dünya yüzeyi: güncel HLS 30 m (Sentinel-2/Landsat; bulutlu, yamalı)', bm: 'Dünya yüzeyi: Blue Marble ≈490 m' }[this.earthDetail]) + '  ⟳';
    if (mb.hidden === showMode) mb.hidden = !showMode;
    if (showMode && this.tileModeTxt !== label) { this.tileModeTxt = label; mb.textContent = label; mb.title = 'Tıklayın: Landsat (temiz) → güncel HLS → yalnız Blue Marble'; }
    // kullanıcıya geri bildirim: yüzey ayrıntısı iniyor mu, alınamıyor mu
    let el = this.tileStatusEl; if (!el) { el = this.tileStatusEl = document.createElement('div'); el.className = 'tilestatus'; el.hidden = true; document.body.appendChild(el); }
    if (padGround) pending = failed = 0;                                                     // kalkışta zemin padground.js'ten (kendi atfı ascBar'da)
    const msg = pending > 0 ? `Yüzey ayrıntısı yükleniyor… (${pending})` : (failed > 0 && loaded === 0 && drawn === 0 ? 'Yüzey ayrıntısı alınamadı: NASA parça sunucusuna erişilemiyor (ağ/reklam engelleyici?)' : '');
    if (msg !== this.tileMsg) { this.tileMsg = msg; el.textContent = msg; el.hidden = !msg; el.classList.toggle('warn', msg.startsWith('Yüzey ayrıntısı alınamadı')); }
  }
}
