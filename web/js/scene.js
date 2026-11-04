// LS19 görüntüleyici: tek sahne, gerçek ölçek (1 birim = 1 km), kamera merkezli çizim + logaritmik derinlik.
// Dünya, Ay, Güneş, yıldızlar ve araç gerçek konum/yönelimlerinde; her kare fizikten gelen durumla güncellenir.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { makeUpperStage, makeLaunchVehicle } from './rocketmodels.js';
import { rocketOf } from './rockets.js';
import * as E from './engine.js';
import { loadTerrain, terrainBasis, HOLE_R } from './terrain.js';
import { R_SITE, SITE_LAT, SITE_LON, siteIcrf, siteMe } from './mission.js';
import { BODIES } from './ephem.js';
import { etOf } from './live.js';
import { HaloRef } from './halo.js';
import { TileLayer } from './tiles.js';
import { AscentView } from './ascentview.js';
import { CameraRig, K_EMB } from './camerarig.js';
import { SkyView } from './skyview.js';
import { VS_BODY, FS_EARTH, VS_ATM, FS_ATM, FS_MOON } from './bodyshaders.js';
import { sphereGeometry, m3ToQuat, bodyMatrix, glowTexture, ringTexture, unit3, conicEach, conicPoints, mixin, SUN_I } from './scenegeom.js';
export { conicEach, conicPoints };
import { PLANETS, poleVec, PLANET_VIS, planetMaterial, atmosphereMesh, ringMaterial, loadPlanetTextures, planetQuaternion } from './planets.js';
import { makeSpaceEnv, ENV_HALF_DEG, makePlume, plumeGeometry, setPlume, plumeTick, makeGlow, Particles } from './fx.js';
import { PointStore } from './pointstore.js';
import { mergeByMaterial } from './meshmerge.js';
import { loadTextures, lowMemory } from './texload.js';
import { TEX } from './texplan.js';
import * as CR from './cr3bp.js';

const { add, sub, scale, dot, cross, norm, unit, mv, mtv } = E;
const EARTH_I = 1.15;                    // Dünya (bulutlar ve okyanus yansıması parlak olduğundan düşük)
const KM = 0.001;                        // m -> km
const TERRAIN_FAR_KM = 25000;            // iniş arazisi yamasının (60 km yarıçap) çizildiği en büyük kamera uzaklığı
// model malzemelerinin PBR değerleri [metalik, pürüzlülük] (kaynak: NASA modellerindeki Maya "blinn" malzemeleri, adlarıyla)
const PBR = {
  lander: { 'blinn1SG.002': [0.55, 0.36], 'blinn4SG.002': [0.4, 0.4], 'blinn5SG.002': [0.35, 0.5], 'blinn2SG.002': [0.4, 0.42], 'blinn6SG.001': [0.1, 0.6], 'initialShadingGr.001': [0.45, 0.4],
    'blinn9SG.001': [0.55, 0.38], 'blinn3SG.001': [0.4, 0.4], 'blinn7SG.002': [0.05, 0.45], 'blinn8SG.001': [0.4, 0.4], 'blinn12SG.001': [0.4, 0.4], 'blinn10SG.001': [0.55, 0.36] },
  orb: { 'blinn2SG': [0.4, 0.45], 'blinn11SG': [0.05, 0.5], 'blinn4SG': [0.4, 0.42], 'blinn13SG': [0.3, 0.5], 'apollohorns_blin': [0.6, 0.34] },
  stage: { 'blinn1SG': [0.0, 0.42], 'blinn2SG': [0.05, 0.6], 'blinn5SG': [0.25, 0.5] } };

// ------------------------------------------------------------------ dünya
export class World {
  constructor(canvas, labelsEl) {
    this.canvas = canvas; this.labelsEl = labelsEl;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.prMax = Math.min(window.devicePixelRatio, 2); this.renderer.setPixelRatio(this.prMax);          // prMax: en yüksek çizim oranı (uyarlanır düşürme perfgov.js)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // GPU bağlamı kaybolursa (sürücü sıfırlaması, bellek baskısı) ana dokular yeniden yüklenemez: çözülmüş bitmap'ler GPU'ya yüklenince bırakılır (bellek).
    // Geri gelince sayfa bir kez yenilenir; 30 sn içinde ikinci kayıpta döngüye girmesin diye yenilenmez, onContextProblem ile kullanıcıya bildirilir (dokular geri gelmez)
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ctxLost = true; });
    canvas.addEventListener('webglcontextrestored', () => {
      let last = 0; try { last = +sessionStorage.getItem('ls19.ctxReload') || 0; sessionStorage.setItem('ls19.ctxReload', String(Date.now())); } catch (err) { /* depolama kapalı */ }
      if (Date.now() - last > 30000) location.reload(); else if (this.onContextProblem) this.onContextProblem();
    });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 1e-5, 1e11);
    this.cam = { mode: 'VEHICLE', az: -2.3, el: 0.22, dist: 0.055, auto: true, key: '' };
    this.trail = { E: new PointStore(), M: new PointStore() };          // Dünya ve Ay merkezli iz (düz Float64 depolar)
    this.labels = {};
    this.attQ = null;                // görüntülenen araç yönelimi (THREE.Quaternion): fizik motorundan gelir (durum x.q)
    this.nStages = 2;                // görev tasarımındaki kademe sayısı (2: TLI kademesi + iniş aracı; 3: + Ay yörünge kademesi)
    this.debrisMeshes = new Map();   // ayrılan kademe kimliği -> model
    this.place = { lander: { exitZ: -1.6, exitR: 0.5, rcsZ: -0.4, rcsR: 1.7 }, orb: { exitZ: -3.28, exitR: 0.85, len: 3.4, rcsZ: -1.2, rcsR: 1.7 }, stage: { exitZ: -16, exitR: 1.0, rcsZ: -14, rcsR: 1.5 } };   // model yerleşimi (m): çan çıkışı z/yarıçap, iticiler halkası z/yarıçap, len: kademe boyu
    this.thrS = {};                  // alev gazı yumuşatma durumu (S: TLI kademesi, O: Ay yörünge kademesi, L: iniş aracı)
    this.camBlend = null;            // otomatik kamera geçişi harmanı (yakın kipler arası)
    this.ready = false;
    this.cine = { on: false, lines: false, rig: null };        // sinematik kip (cinema.js yönetir): rig(x, info, world) → kamera pozu; lines: iz çizgileri görünsün
    this.post = null; this._postLoad = null; this._lastRender = 0;
  }

  // Yükleme hattı: dokular (texload.js: ana iş parçacığı dışında çözme, GPU'ya kareler arasında yükleme), arazi verisi ve modeller birlikte iner;
  // sahne kurulunca gölgelendiriciler önceden derlenir (ilk çizim derleme için donmasın).
  async load(base, onProgress = () => {}) {
    this.base = base;
    const lowmem = this.lowMem = lowMemory(), total = TEX.length * 2 + 5; let done = 0;       // doku başına 2 adım (çözüldü, GPU'da) + arazi verisi + 3 model + derleme
    const tick = (n) => { done++; onProgress(Math.min(1, done / total), n); };
    const json = (f) => fetch(base + f).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((x) => { tick('dem'); return x; });
    const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
    const glb = (f) => new Promise((res) => gl.load(base + 'models/' + f, (g) => { tick(f); res(g.scene); }, undefined, () => { tick(f + ' (yok)'); res(null); }));
    const [T, dem, lander, stage, orb] = await Promise.all([loadTextures(this.renderer, base, { lowmem, tick }), json('data/site_dem.json'),
      glb('lander.glb'), glb('stage.glb'), glb('orb.glb')]);          // NASA resmî Apollo modelleri: LM, S-IVB, hizmet modülü (tools/apollo_modelleri.mjs)
    this.build({ ...T, dem, lander, stage, orb });
    await this.precompile(); tick('gölgelendiriciler');
    this.ready = true;
  }
  // Programları (gölgelendirici bağlama) ilk çizimden önce derle: KHR_parallel_shader_compile varsa ana iş parçacığını tutmadan.
  // Eşzamanlı hata denetimi paralel derlemeyi engeller: derleme sırasında kapatılır, sonra bağlama durumu toplu denetlenir.
  async precompile() {
    const r = this.renderer, gl = r.getContext(), was = r.debug.checkShaderErrors;
    try {
      r.debug.checkShaderErrors = false;
      if (r.extensions.has('KHR_parallel_shader_compile')) await Promise.race([r.compileAsync(this.scene, this.camera), new Promise((res) => setTimeout(res, 10000))]);          // takılırsa ilk çizimde derlenir
      else r.compile(this.scene, this.camera);                                                    // eklenti yok: eşzamanlı derle (yine de ilk çizim karesinden önce, yükleme ekranındayken); compileAsync uyarı basardı
    } catch (e) { /* ilk çizimde derlenir */ } finally { r.debug.checkShaderErrors = was; }
    for (const p of r.info.programs || []) if (p.program && !gl.getProgramParameter(p.program, gl.LINK_STATUS)) console.error('Gölgelendirici bağlanamadı:', gl.getProgramInfoLog(p.program));
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
    this.sunLight.castShadow = true; this.sunLight.shadow.mapSize.set(2048, 2048); this.sunLight.shadow.bias = -0.00015; this.sunLight.shadow.normalBias = 0.00003;
    S.add(this.sunLight); S.add(this.sunLight.target);
    this.ambient = new THREE.AmbientLight(0x8899bb, 0.02); S.add(this.ambient);
    this.cineFill = new THREE.DirectionalLight(0xaec3ff, 0); S.add(this.cineFill); S.add(this.cineFill.target);      // sinematik kipte soğuk dolgu ışığı (kameradan): gölgedeki gövde silüete dönmesin
    // Dünya
    const eu = { dayMap: { value: A.day || flat([40, 80, 160, 255]) }, nightMap: { value: A.night || flat([0, 0, 0, 255]) },
      cloudMap: { value: A.clouds || flat([0, 0, 0, 255]) }, specMap: { value: A.spec || flat([0, 0, 0, 255]) },
      normalMap: { value: A.enorm || flat([128, 128, 255, 255]) }, sunDir: { value: new THREE.Vector3(1, 0, 0) }, sunI: { value: EARTH_I },
      heightMap: { value: flat([0, 0, 0, 255]) }, hSize: { value: new THREE.Vector2(1, 1) }, radius: { value: E.R_E }, useHeight: { value: 0 }, obsMode: { value: 0 },
      tileMap: { value: flat([0, 0, 0, 255]) }, useTile: { value: 0 }, tileKind: { value: 0 },
      parentMap: { value: flat([0, 0, 0, 255]) }, pXf: { value: new THREE.Vector4(1, 1, 0, 0) }, pHas: { value: 0 }, tileFade: { value: 1 } };      // parça geçişi (her parça kendi kopyasını alır: tiles.js)
    this.earth = new THREE.Mesh(sphereGeometry(E.R_E, 1024, 512), new THREE.ShaderMaterial({ uniforms: eu, vertexShader: VS_BODY, fragmentShader: FS_EARTH }));
    S.add(this.earth);                                    // görüş dışındaki cisim köşe işlemeye girmez (frustum culling): her biri ~1 milyon üçgen
    this.atm = new THREE.Mesh(sphereGeometry(E.R_E * 1.0125, 256, 128), new THREE.ShaderMaterial({
      uniforms: { sunDir: eu.sunDir, sunI: eu.sunI }, vertexShader: VS_ATM, fragmentShader: FS_ATM, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    S.add(this.atm);
    // Ay (LOLA ile yer değiştirmiş)
    const sd = siteMe();
    const mu = { colorMap: { value: A.mcol || flat([150, 150, 150, 255]) }, normalMap: { value: A.mnorm || flat([128, 128, 255, 255]) },
      heightMap: { value: A.mh || flat([0, 0, 0, 255]) }, hSize: { value: new THREE.Vector2(...(A.mh ? A.mh.userData.size : [1, 1])) },          // boyut: yükleyici saklar (bitmap GPU'ya yüklenince kapatılır)
      radius: { value: E.R_M }, useHeight: { value: A.mh ? 1 : 0 },
      sunDir: { value: new THREE.Vector3(1, 0, 0) }, earthDir: { value: new THREE.Vector3(1, 0, 0) }, sunI: { value: SUN_I },
      siteDir: { value: new THREE.Vector3(sd[0], sd[1], sd[2]) }, albScale: { value: 0.8 }, holeCos: { value: 2.0 },          // delik (arazi yaması varken küre çizilmez): arazi hazır olunca açılır (loadTerrain)
      tileMap: { value: flat([128, 128, 128, 255]) }, useTile: { value: 0 }, lodDelta: { value: 0 }, tileAlpha: { value: 0 }, latCut: { value: 2 }, tilePull: { value: 0 },
      parentMap: { value: flat([128, 128, 128, 255]) }, pXf: { value: new THREE.Vector4(1, 1, 0, 0) }, pHas: { value: 0 }, tileFade: { value: 1 } };
    this.moon = new THREE.Mesh(sphereGeometry(E.R_M, 1024, 512), new THREE.ShaderMaterial({ uniforms: mu, vertexShader: VS_BODY, fragmentShader: FS_MOON }));
    this.moon.geometry.boundingSphere.radius = E.R_M + 15; S.add(this.moon);          // LOLA yer değiştirmesi (±11 km) küre sınırının dışına taşabilir
    this.moonU = mu; this.earthU = eu; this.holeCos0 = mu.holeCos.value;
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
    // iniş arazisi: üretimi Web Worker'da (~0,9 sn, ana iş parçacığını tutmaz). Gelene dek aynı öznitelik/malzeme kümesiyle yer tutucu ağ durur:
    // gölgelendirici derlemesi (precompile) hazır olur, Ay küresinde delik açılmaz (holeCos 2.0); hazır olunca geometri ve ayrıntı dokusu yerine geçer
    if (A.dem) {
      const B = terrainBasis(SITE_LAT * 180 / Math.PI, SITE_LON * 180 / Math.PI, E.R_M, R_SITE - E.R_M);
      const ph = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); ph.channel = 1; ph.needsUpdate = true;          // yer tutucu normal haritası (aynı uv kanalı: aynı program)
      const mat = new THREE.MeshStandardMaterial({ map: A.mcol, vertexColors: true, roughness: 1.0, metalness: 0.0, color: new THREE.Color(0.8, 0.8, 0.8),
        normalMap: ph, normalScale: new THREE.Vector2(0.9, 0.9) });
      const g0 = new THREE.BufferGeometry();
      for (const [n, k] of [['position', 3], ['normal', 3], ['uv', 2], ['uv1', 2], ['color', 3]]) g0.setAttribute(n, new THREE.BufferAttribute(new Float32Array(3 * k), k));
      this.terrain = new THREE.Mesh(g0, mat); this.terrain.receiveShadow = true; this.terrain.visible = false; this.terrain.frustumCulled = false;
      this.terrainSite = B.sitePos; this.terrainReady = false; S.add(this.terrain);
      loadTerrain(A.dem, SITE_LAT * 180 / Math.PI, SITE_LON * 180 / Math.PI, E.R_M, R_SITE - E.R_M).then(({ geometry, detail }) => {
        const t = this.terrain, old = t.geometry, oldMap = t.material.normalMap;
        t.geometry = geometry; t.material.normalMap = detail; t.frustumCulled = true; old.dispose(); oldMap.dispose();
        this.holeCos0 = Math.cos(HOLE_R / E.R_M); this.terrainReady = true;                // sonraki karede placeTerrain görünürlüğü ve deliği ayarlar
      });
    }
    // araç
    this.vehicle = new THREE.Group(); S.add(this.vehicle);
    this.landerModel = this.prepModel(A.lander, 'lander');
    this.stageModel = this.prepModel(A.stage, 'stage');             // TLI kademesi (şablon; araçtaki ve ayrılan kopyalar bundan klonlanır)
    this.orbModel = A.orb ? this.prepModel(A.orb, 'orb') : this.makeOrbitalStage();         // Ay yörünge kademesi (iki kademeli iniş aracı; şablon)
    this.vehicle.add(this.landerModel);
    // yığın (üstten alta): iniş aracı / Ay yörünge kademesi (varsa) / TLI kademesi; motorlar en altta
    this.orbStage = this.orbModel.clone(); this.orbStage.position.set(0, 0, -3.05 * KM); this.vehicle.add(this.orbStage);
    this.stackStage = this.stageModel.clone(); this.stackStage.position.set(0, 0, -3.05 * KM); this.vehicle.add(this.stackStage);
    // plümler (fx.js) model grubunun içinde: birimler metre (grup ölçeği 1e-3); çıkışta HDR ışıma sprite'ı bloom'u besler
    const ML = this.place.lander, MO = this.place.orb, MS = this.place.stage;          // modellerin yerleşim sayıları (çan çıkışı/yarıçapı, iticiler halkası); model dosyasının extras'ından
    const C = (r, g, b) => new THREE.Color(r, g, b);
    const addPlume = (parent, ex, len, hot, cool, gain, opts, glowC, glowK) => {
      const f = makePlume(ex.exitR, len, hot, cool, gain, opts); f.position.set(0, 0, ex.exitZ); parent.add(f);
      const g = makeGlow(C(1, 1, 1), ex.exitR * glowK); g.position.set(0, 0, -0.15); g.userData.col = glowC; f.add(g); f.userData.glow = g; return f;
    };
    this.flameL = addPlume(this.landerModel, ML, 10, C(2.6, 2.0, 1.2), C(0.35, 0.45, 1.5), 0.7, { widen: 1.9, diamonds: 0.35, kS: 3.2 }, C(1.4, 1.0, 0.6), 4.5);
    this._addPlume = addPlume;
    this.stageKey = 'sivb'; this.stageModels = { sivb: { group: this.stageModel, place: { ...MS, engines: [[0, 0]] }, plume: 'hydrolox' } };
    this.flameSx = [];
    this.flameS = this.makeStagePlume(this.stackStage, MS);
    this.flameO = addPlume(this.orbStage, MO, 13, C(2.6, 2.0, 1.2), C(0.35, 0.45, 1.5), 0.65, { widen: 1.8, kS: 3.2 }, C(1.4, 1.0, 0.6), 4.2);
    this.engineLight = new THREE.PointLight(0xffb070, 0, 0.1, 2); this.engineLight.position.set(0, 0, ML.exitZ - 1.0); this.landerModel.add(this.engineLight);
    this.rcsSets = { lander: this.makeRcsPlumes(ML.rcsZ, ML.rcsR), orb: this.makeRcsPlumes(-3.05 + MO.rcsZ, MO.rcsR), tli: this.makeRcsPlumes(-3.05 + MS.rcsZ, MS.rcsR) };      // iticiler (gövde z, yarıçap; m); tli halkası yığın düzenine göre update'te kaydırılır
    for (const g of Object.values(this.rcsSets)) { this.vehicle.add(g.grp); g.grp.visible = false; }
    // parçacıklar: Ay tozu (iniş yerine bağlı çerçeve, normal harman) ve ayrılma pufları (aracı izleyen eylemsiz çerçeve, toplamalı)
    this.dust = new Particles(2800, { color: [0.52, 0.48, 0.43] }); S.add(this.dust.group);
    this.puffs = new Particles(500, { additive: true, color: [1.0, 0.92, 0.78] }); this.puffs.mat.uniforms.uLit.value = 3.0; S.add(this.puffs.group);
    // uzay ortamı (earthshine/moonshine IBL): yalnız dolaylı ışık; Güneş DirectionalLight
    this.env = makeSpaceEnv(this.renderer); this.scene.environment = this.env.earth; this.scene.environmentIntensity = 0;
    // işaretçiler
    const ring = ringTexture();
    const mk = (color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ring, color, sizeAttenuation: false, depthTest: false, toneMapped: false }));
      s.scale.set(size, size, 1); s.renderOrder = 10; S.add(s); return s; };
    this.makeMarker = mk; this.debrisMarkers = new Map();                // ayrılan her kademenin işaretçisi ve (adlı) etiketi update'te yaratılır
    this.vehMarker = mk(0xffd27a, 0.022); this.siteMarker = mk(0x7ee0a8, 0.016);
    // sinematik geniş çekimlerde aracın ışıltısı (sabit açısal boyutlu HDR sprite; bloom'u besler)
    const bcn = (c, k) => { const g = makeGlow(c, 1); g.material.sizeAttenuation = false; g.material.depthTest = false; g.scale.set(k, k, 1); g.renderOrder = 11; g.visible = false; S.add(g); return g; };
    this.beacon = bcn(new THREE.Color(5, 3.6, 1.8), 0.03); this.beaconE = bcn(new THREE.Color(1.1, 1.8, 4.2), 0.034); this.beaconM = bcn(new THREE.Color(2.6, 2.5, 2.3), 0.022);
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
    for (const [k, txt] of [['stagetag', ''], ['earth', 'Dünya'], ['moon', 'Ay'], ['veh', 'Araç'], ['site', 'Apollo 11 iniş yeri'], ['emb', 'Dünya–Ay kütle merkezi'], ['lp', 'L1'], ['lp2', 'L2']]) {
      const d = document.createElement('div'); d.className = 'lbl lbl-' + k; d.textContent = txt; this.labelsEl.appendChild(d); this.labels[k] = d;
    }
  }

  // Araç modeli hazırla: glTF Y-yukarı → gövde çerçevesi (z itki ekseni, motor çanı −z), birim metre (grup ölçeği 1e-3). Modeller NASA'nın resmî Apollo modellerinden üretilir (tools/apollo_modelleri.mjs):
  // iniş aracı ← LM, Ay yörünge kademesi ← hizmet modülü, TLI kademesi ← Saturn V S-IVB; yerleşim sayıları (çan çıkışı, iticiler halkası, kademe boyu) dosyanın extras'ında (userData) gelir.
  // Dosya yoksa basit yedek geometri çizilir.
  prepModel(scene3, kind) {
    const g = new THREE.Group();
    if (!scene3) {
      const mat = new THREE.MeshStandardMaterial({ color: kind === 'lander' ? 0xc8a24a : 0xdadde2, metalness: 0.6, roughness: 0.4 });
      const m = kind === 'lander' ? new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 3.2, 16), mat) : new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 12, 16), mat);
      m.rotation.x = Math.PI / 2; if (kind !== 'lander') m.position.z = -8;
      g.add(m); g.scale.setScalar(KM);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      return g;
    }
    const inner = new THREE.Group(); inner.rotation.x = Math.PI / 2; inner.add(scene3);   // glTF Y-yukarı -> gövde Z-yukarı
    g.add(inner); g.scale.setScalar(KM);
    const pbr = PBR[kind] || {};
    scene3.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material, t = m && pbr[m.name];
      if (t) { m.metalness = t[0]; m.roughness = t[1]; }           // kaynak modeller Maya "blinn" malzemeleri (metalik yok): folyo ve metal yüzeylere ortam yansıması için PBR değeri verilir
    });
    (this.mergeInfo = this.mergeInfo || {})[kind] = mergeByMaterial(scene3);               // yüzlerce küçük ağ → malzeme başına bir ağ (çizim çağrısı ve gölge geçişi yükü)
    const u = scene3.userData || {};
    for (const k of ['exitZ', 'exitR', 'len', 'rcsZ', 'rcsR']) if (typeof u[k] === 'number') this.place[kind][k] = u[k];
    return g;
  }

  // Ay yörünge kademesi (iki kademeli iniş aracı): beyaz boyalı yakıt tankı, altın MLI kuşağı, titanyum halkalar, niyobyum motor çanı; birimler metre (grup ölçeği 1e-3).
  // Kademe iniş aracının altına oturur (üst yüzü yerel z = 0), motor çanı en altta (egzoz −z). orbExitZ: çan çıkışı (m).
  makeOrbitalStage() {
    const g = new THREE.Group(), M = (o) => new THREE.MeshStandardMaterial(o);
    const white = M({ color: 0xe9e9e4, metalness: 0.0, roughness: 0.55 }), gold = M({ color: 0xc9983a, metalness: 1.0, roughness: 0.32 }),
      ti = M({ color: 0x9b9ea3, metalness: 1.0, roughness: 0.35 }), nb = M({ color: 0x6c6a6e, metalness: 1.0, roughness: 0.42, side: THREE.DoubleSide }), dark = M({ color: 0x3b3d42, metalness: 0.2, roughness: 0.6 });
    const cyl = (r0, r1, h, mat, z, open = false) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 48, 1, open), mat); o.rotation.x = Math.PI / 2; o.position.z = z; g.add(o); return o; };
    cyl(1.5, 1.5, 0.14, ti, -0.07);                                   // üst bağlantı halkası
    cyl(1.45, 1.45, 2.0, white, -1.14);                               // tank gövdesi
    cyl(1.47, 1.47, 0.55, gold, -1.14);                               // MLI kuşağı
    cyl(1.5, 1.5, 0.14, ti, -2.21);                                   // alt halka
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.45, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2), white);
    dome.rotation.x = -Math.PI / 2; dome.scale.set(1, 0.4, 1); dome.position.z = -2.28; g.add(dome);          // alt kubbe (−z'ye doğru)
    cyl(0.33, 0.85, 1.0, nb, -2.78, true);                            // motor çanı
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.3), dark); b.position.set(1.56 * Math.cos(a), 1.56 * Math.sin(a), -0.5); b.rotation.z = a; g.add(b); }   // RCS blokları
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.scale.setScalar(KM); Object.assign(this.place.orb, { exitZ: -3.28, exitR: 0.85, len: 3.4, rcsZ: -1.2, rcsR: 1.7 });
    return g;
  }

  // RCS iticileri (6-DOF): gövde çerçevesinde (z, yarıçap; m) dört sıralı çift grubu; her eksen/işaret için iki duman (tork çifti). Fizikteki RCS görev oranı (x.att.duty) ile birebir yanar:
  //   τx>0: +y sıradaki jet −z yönünde, −y sıradaki +z yönünde püskürtür (kuvvet +z / −z); τy>0: +x'te +z, −x'te −z püskürtme (kuvvet −z / +z); τz>0: +x'te −y, −x'te +y püskürtme (teğetsel).
  makeRcsPlumes(z, R) {
    const grp = new THREE.Group(); grp.scale.setScalar(KM); grp.position.set(0, 0, z * KM);
    this._rcsGeo = this._rcsGeo || plumeGeometry(0.11, 1.7, 2.2);                                          // ortak geometri: yanma ekseni −z, setFromUnitVectors ile püskürtme yönüne döner
    // [eksen, işaret, konum, püskürtme yönü]
    const defs = [[0, 1, [0, R, 0], [0, 0, -1]], [0, 1, [0, -R, 0], [0, 0, 1]], [0, -1, [0, R, 0], [0, 0, 1]], [0, -1, [0, -R, 0], [0, 0, -1]],
      [1, 1, [R, 0, 0], [0, 0, 1]], [1, 1, [-R, 0, 0], [0, 0, -1]], [1, -1, [R, 0, 0], [0, 0, -1]], [1, -1, [-R, 0, 0], [0, 0, 1]],
      [2, 1, [R, 0, 0], [0, -1, 0]], [2, 1, [-R, 0, 0], [0, 1, 0]], [2, -1, [R, 0, 0], [0, 1, 0]], [2, -1, [-R, 0, 0], [0, -1, 0]]];
    const jets = defs.map(([axis, sign, pos, dir]) => {
      const m = makePlume(0.11, 1.7, new THREE.Color(2.4, 2.8, 3.6), new THREE.Color(0.45, 0.65, 1.8), 0.9, { diamonds: 0, kS: 1.4 }, this._rcsGeo);
      m.position.set(...pos); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(...dir)); m.visible = false; grp.add(m);
      return { m, axis, sign };
    });
    return { grp, jets };
  }
  // fizikten gelen RCS görev oranlarını göster (duty: [x, y, z], −1..1); set: rcsSets girdisi ya da null (gizle)
  showRcs(set, duty) {
    for (const g of Object.values(this.rcsSets)) if (g !== set) g.grp.visible = false;
    if (!set) return;
    set.grp.visible = true;
    for (const j of set.jets) { const d = duty ? duty[j.axis] * j.sign : 0; setPlume(j.m, d > 0.02 ? Math.min(1, d) : 0); }
  }
  // TLI kademesinin motor alevi: hidrolox (LH2/LOX) soluk mavi, kerolox (RP-1/LOX) turuncu; çok motorlu kademede ek alevler birincinin durumunu izler (flameSx)
  makeStagePlume(parent, MS, kind = 'hydrolox', engines = [[0, 0]]) {
    const C = (r, g, b) => new THREE.Color(r, g, b), ker = kind === 'kerolox';
    const mk = () => this._addPlume(parent, MS, 24, ker ? C(2.6, 1.7, 0.9) : C(1.9, 2.2, 3.2), ker ? C(0.7, 0.32, 0.12) : C(0.12, 0.24, 1.3), 0.8, { widen: 1.9, diamonds: ker ? 0.2 : 0.12, kS: 3.0 },
      ker ? C(1.7, 1.0, 0.5) : C(0.8, 1.0, 1.7), 4.2);
    const fs = engines.map(([x, y]) => { const f = mk(); f.position.x = x; f.position.y = y; return f; });
    this.flameSx = fs.slice(1);
    return fs[0];
  }
  // Tasarımdaki roketin TLI kademesini kullan (rockets.js model anahtarı): S-IVB resmî NASA modeli, diğerleri ölçüden çizim (rocketmodels.js).
  // Yığındaki kademe, alevi, iticileri ve ayrılan kademe enkazı şablonu değişir.
  setStageModel(key) {
    if (!this.stageModels || key === this.stageKey) return;
    let e = this.stageModels[key];
    if (!e) { const m = makeUpperStage(key); if (!m) return; e = this.stageModels[key] = m; }
    this.stageKey = key; this.stageModel = e.group; Object.assign(this.place.stage, e.place);
    const MS = this.place.stage;
    this.vehicle.remove(this.stackStage);
    this.stackStage = e.group.clone(); this.stackStage.position.set(0, 0, -3.05 * KM); this.vehicle.add(this.stackStage);
    this.flameS = this.makeStagePlume(this.stackStage, MS, e.plume, e.place.engines || [[0, 0]]);
    this.vehicle.remove(this.rcsSets.tli.grp);
    this.rcsSets.tli = this.makeRcsPlumes(-3.05 + MS.rcsZ, MS.rcsR); this.vehicle.add(this.rcsSets.tli.grp); this.rcsSets.tli.grp.visible = false;
    for (const m of this.debrisMeshes.values()) this.scene.remove(m);
    this.debrisMeshes.clear();
  }
  // gimbal: alev (−z yönünde uzanır) motorun gövdeye göre sapmasıyla (x, y teğet) döner
  setNozzle(flame, g) {
    if (!g) { flame.quaternion.identity(); return; }
    this._v1 = this._v1 || new THREE.Vector3(); this._v2 = this._v2 || new THREE.Vector3(0, 0, -1);
    flame.quaternion.setFromUnitVectors(this._v2, this._v1.set(-g[0], -g[1], -1).normalize());
  }

  resetDynamic() {
    this.embT = null; this.plT = null; this.embRef = null; this.moonPathT = null; this.resetTrail(); this.attQ = null; this._nDeb = undefined;
    if (this.puffs) { this.puffs.n = 0; this.puffs.group.visible = false; this.dust.n = 0; this.dust.group.visible = false; }
    for (const m of this.debrisMeshes.values()) m.visible = false;
    if (this.rcsSets) this.showRcs(null, null);
  }
  // tasarım: halo profilinde referans halo yörüngesini (Ay'a göre) örnekle
  setDesign(D) {
    this.haloPts = null;
    this.nStages = D && D.STAGES ? D.STAGES.length : 2;
    const rk = rocketOf(D && D.STAGES && D.STAGES[0] ? D.STAGES[0].rocket : null);
    this.setStageModel(rk.model);
    if (this.labels.stagetag) this.labels.stagetag.textContent = rk.stageNote || '';     // yakın planda TLI kademesinin ne olduğu
    if (D && D.profile === 'HALO' && D.HALO && D.HALO.patches) {
      const ref = new HaloRef(null, D.HALO.patches, D.HALO.tDep, D.HALO.tNri);
      this.haloPts = ref.sample(Math.max(600, D.HALO.T / 400)).map((q) => q.r);
    }
  }

  resetTrail() { this.trail = { E: new PointStore(), M: new PointStore() }; }
  addTrail(points, reset) {
    if (reset) this.resetTrail();
    for (const q of points) {
      const rm = E.moonPos(q.t), rs = sub(q.r, rm);
      if (norm(rs) < E.MOON_ZONE) this.trail.M.push(rs); else this.trail.E.push(q.r);
    }
  }

  setPixelRatio(r) { this.renderer.setPixelRatio(r); this.resize(this.canvas.clientWidth, this.canvas.clientHeight); }          // uyarlanır çözünürlük: tampon yeni orana göre yeniden boyutlanır
  resize(w, h) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); if (this.post) this.post.setSize(w, h); }

  // ---------------------------------------------------------------- kare güncelle
  update(x, extra) {
    if (!this.ready || !x) return;
    if (this.skyMode) this.setSkyMode(false);
    this.earthU.obsMode.value = 0;
    const t = x.t, rm = E.moonPos(t), sun = E.sunPos(t);
    const central = norm(sub(x.r, rm)) < E.MOON_ZONE ? 'M' : 'E';
    const Mme = E.moonIcrfToMe(t), Mitrf = E.earthIcrfToItrf(t);
    // araç yönelimi: fizik motoru taşır (x.q = gövde → ICRF kuaterniyonu, gövde +z itki ekseni; hız sınırlı, sürekli, itki bu eksen boyunca uygulanır). Görüntü yalnız çizer.
    if (!this.attQ) this.attQ = new THREE.Quaternion();
    if (x.q) this.attQ.set(x.q[0], x.q[1], x.q[2], x.q[3]);
    else this.attQ.copy(this.fallbackAttitude(x, central, rm, t));          // yönelimsiz fizik (uyumluluk kipi): kaba ideal yönelim
    const zNow = new THREE.Vector3(0, 0, 1).applyQuaternion(this.attQ);
    // model başvuru noktası: fiziksel nokta = iniş ayakları; model orijini gövde z boyunca 2.9 m yukarıda
    const vehPos = this.asc ? x.r.slice() : add(x.r, [zNow.x * 0.0029, zNow.y * 0.0029, zNow.z * 0.0029]);     // kalkışta roket tabanı = fiziksel nokta (rampaya oturur)
    const info = { rm, central, vehPos, drAxis: extra.drAxis, local: extra.local, axis: [zNow.x, zNow.y, zNow.z] };
    this.autoCamera(x, info);
    const pose = this.blendedPose(x, info, extra.dtReal || 0.016);
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
    this.updateTiles();
    if (this.terrainReady) this.placeTerrain(rm, Mme, eye, rel);
    // araç
    rel(vehPos, this.vehicle.position); this.vehicle.quaternion.copy(this.attQ);
    // aktif kademeye göre araç: yığın (üstten alta) iniş aracı / Ay yörünge kademesi (iki kademeli iniş aracı, ayrılana dek) / TLI kademesi (ayrılana dek);
    // her kademenin kendi motoru yanar, ayrılan kademe araçtan kalkar ve aşağıdaki enkaz olarak çizilir
    const nSt = this.nStages, last = nSt - 1, k = x.k, thr = x.thr || 0;
    this.stackStage.visible = k === 0;
    this.orbStage.visible = nSt > 2 && k <= 1;
    const orbLen = this.place.orb.len, stackTop = 3.05 + (nSt > 2 ? orbLen : 0);
    this.stackStage.position.z = -stackTop * KM;                                           // TLI kademesi Ay yörünge kademesinin altında
    this.rcsSets.tli.grp.position.z = (-stackTop + this.place.stage.rcsZ) * KM;
    // alev boyu/parlaklığı motorun gaz tepkisi gibi yumuşar (gaz basamakları alevi aniden büyütüp küçültmez; yalnız görüntü)
    const sm = (key, target) => { const a = 1 - Math.exp(-Math.min(0.1, extra.dtReal || 0.016) / 0.3); const v = (this.thrS[key] ?? 0) + (target - (this.thrS[key] ?? 0)) * a; this.thrS[key] = target === 0 && v < 0.01 ? 0 : v; return this.thrS[key]; };
    plumeTick(Math.min(0.1, extra.dtReal || 0.016));
    const pl = (f, v) => { setPlume(f, v); const g = f.userData.glow, c = g.userData.col; g.visible = v > 0.004; g.material.color.setRGB(c.r * v, c.g * v, c.b * v); };
    pl(this.flameS, sm('S', k === 0 ? thr : 0)); for (const f of this.flameSx) pl(f, this.thrS.S || 0); pl(this.flameO, sm('O', nSt > 2 && k === 1 ? thr : 0)); pl(this.flameL, sm('L', k === last ? thr : 0));
    const A = x.att, gim = A && A.g && thr > 0 ? A.g : null;                               // 6-DOF: gimbal (gövde x, y teğetleri) ve RCS görev oranı fizikten gelir
    this.setNozzle(this.flameS, k === 0 ? gim : null); for (const f of this.flameSx) this.setNozzle(f, k === 0 ? gim : null); this.setNozzle(this.flameO, nSt > 2 && k === 1 ? gim : null); this.setNozzle(this.flameL, k === last ? gim : null);
    this.showRcs(A ? (k === last ? this.rcsSets.lander : nSt > 2 && k === 1 ? this.rcsSets.orb : k === 0 ? this.rcsSets.tli : null) : null, A ? A.duty : null);
    const dCamVeh = norm(sub(vehPos, eye));
    // motor ışığı: etkin motorun çıkışının 1 m altında; ışık yakındaki gövdeyi ve (inişte) zemini turuncu aydınlatır (Ay'da gölge kenarları, bacaklar)
    this.engineLight.position.z = (k === last ? this.place.lander.exitZ : k === 0 ? -stackTop + this.place.stage.exitZ : -3.05 + this.place.orb.exitZ) - 1.0;
    this.engineLight.color.set(k === 0 ? 0xa8c4ff : 0xffb070);
    this.engineLight.intensity = dCamVeh < 2 ? 3.0e-5 * (this.thrS.S || 0) * (k === 0 ? 3 : 0) + 3.5e-5 * Math.max(this.thrS.L || 0, this.thrS.O || 0) : 0;
    if (this.asc) { for (const c of this.vehicle.children) if (c !== this.asc.root) c.visible = false; this.engineLight.intensity = 0; }   // kalkış: yalnız tam roket
    if (this.asc) this.applyAscent(rel);
    // ayrılan kademeler: her biri kendi modeliyle (TLI kademesi ya da Ay yörünge kademesi), kendi yörüngesinde ve ayrıldığı andaki eylemsiz yönelimiyle çizilir; görev boyunca kalır
    const seenDebris = new Set();
    for (const d of extra.debris || []) {
      let m = this.debrisMeshes.get(d.id);
      if (!m) { m = (d.kind === 'orb' ? this.orbModel : this.stageModel).clone(true); this.scene.add(m); this.debrisMeshes.set(d.id, m); }
      m.visible = true; rel(d.r, m.position);
      if (d.q) m.quaternion.set(d.q[0], d.q[1], d.q[2], d.q[3]); else m.quaternion.copy(this.attQ);
      // ayrıldığı yığın konumundan (araç referans noktasının −z'sinde: TLI kademesi üstü 0,15 m, üç kademeli araçta Ay yörünge kademesinin altında) kopar: ayrılırken sıçrama olmaz
      const off = d.kind === 'orb' ? 0.15 : 0.15 + (this.nStages > 2 ? this.place.orb.len : 0);
      m.position.add(new THREE.Vector3(0, 0, -off * KM).applyQuaternion(m.quaternion));
      seenDebris.add(d.id);
    }
    for (const [id, m] of this.debrisMeshes) if (!seenDebris.has(id)) m.visible = false;
    // tutulma: araç Dünya ya da Ay gölgesindeyse doğrudan Güneş ışığı yok (yarı gölge Güneş'in açısal yarıçapıyla)
    const sv = unit(sub(sun, x.r)), sunAng = 0.00465;
    let lit = 1;
    for (const [c, R] of [[[0, 0, 0], E.R_E], [rm, E.R_M]]) {
      const b = sub(c, x.r), bn = norm(b); if (dot(b, sv) <= 0) continue;
      const sep = Math.acos(Math.max(-1, Math.min(1, dot(b, sv) / bn))), bAng = Math.asin(Math.min(1, R / bn));
      lit = Math.min(lit, Math.max(0, Math.min(1, (sep - (bAng - sunAng)) / (2 * sunAng))));
    }
    this.sunLight.intensity = Math.PI * SUN_I * lit;
    this.ambient.intensity = 0.014 + (central === 'E' && lit < 1 ? 0.02 : 0);
    this.eclipse = lit;
    this.updateEnv(vehPos, sun, rm, lit);
    this.updateFx(Math.min(0.1, extra.dtReal || 0.016), x, extra, info, zNow, rel, sd, lit, k, thr);
    // gölge: araç kendi üstüne ve yüzeye gölge atar; kamera uzaktaysa (>1 km) gölge haritası yenilenmez
    this.sunLight.castShadow = true; this.renderer.shadowMap.autoUpdate = dCamVeh < 1.0;
    const lt = rel(vehPos);
    this.sunLight.target.position.copy(lt); this.sunLight.position.copy(lt.clone().add(sd.clone().multiplyScalar(0.1)));
    if (this.cine.on) {                                                                 // dolgu: kamera tarafından, hafif yukarıdan ve sağdan; Güneş doğrudan ışığı baskın kalır
      const cq = this.camera.quaternion, fw = new THREE.Vector3(0, 0, -1).applyQuaternion(cq), rt = new THREE.Vector3(1, 0, 0).applyQuaternion(cq), upv = new THREE.Vector3(0, 1, 0).applyQuaternion(cq);
      this.cineFill.target.position.copy(lt); this.cineFill.position.copy(lt.clone().addScaledVector(fw, -0.1).addScaledVector(rt, 0.04).addScaledVector(upv, 0.03));
      this.cineFill.intensity = Math.PI * (0.085 + 0.07 * (1 - Math.min(1, this.eclipse ?? 1)));              // tutulmada biraz daha güçlü: gövde silüete dönmesin
    } else this.cineFill.intensity = 0;
    const sc = this.sunLight.shadow.camera; sc.left = -0.035; sc.right = 0.035; sc.top = 0.035; sc.bottom = -0.035; sc.near = 0.03; sc.far = 0.17; sc.updateProjectionMatrix();
    // işaretçiler (uzakta sabit ekran boyu)
    this.vehMarker.visible = !this.asc && dCamVeh > 1.5; rel(x.r, this.vehMarker.position);          // kalkışta (yer kamerası uzakta) işaret halkası yok
    this.beacon.visible = this.cine.on && !!this.cine.beacon && dCamVeh > 0.8; rel(x.r, this.beacon.position);
    // geniş çekimlerde Dünya ve Ay çok küçükse (< ~9 piksel yarıçap) ışıltı işaretleri: yer imi gibi, cisimler büyütülmez
    const pxOf = (R, c) => { const d = norm(sub(c, eye)); return (R / d) * (this.canvas.clientHeight / 2) / Math.tan(this.camera.fov * Math.PI / 360); };
    this.beaconE.visible = this.cine.on && !!this.cine.beacon && pxOf(E.R_E, [0, 0, 0]) < 9; rel([0, 0, 0], this.beaconE.position);
    this.beaconM.visible = this.cine.on && !!this.cine.beacon && pxOf(E.R_M, rm) < 9; rel(rm, this.beaconM.position);
    const siteG = add(rm, siteIcrf(t)); rel(siteG, this.siteMarker.position);
    this.siteMarker.visible = norm(sub(siteG, eye)) > 25 && norm(sub(rm, eye)) < 60000;
    // çizgiler
    this.updateLines(x, t, rm, central, eye, extra);
    // etiketler
    const solarV = this.cam.mode === 'SOLAR';                 // Güneş sistemi görünümünde gezegen etiketleri yeterli
    this.placeLabel('earth', [0, 0, E.R_E * 1.08], norm(eye) > 30000 && !solarV, 0);
    this.placeLabel('moon', add(rm, [0, 0, E.R_M * 1.12]), norm(sub(rm, eye)) > 9000 && !solarV, 0);
    this.placeLabel('veh', x.r, dCamVeh > 1.5 && !solarV && !this.asc, 14);
    // yakın planda (araç görünümü) TLI kademesinin etiketi: kademe takılıyken, kademenin ortasında
    if (this.labels.stagetag) {
      const on = this.stackStage.visible && dCamVeh < 0.6 && !this.cine.on && !!this.labels.stagetag.textContent;
      if (on) { const off = new THREE.Vector3(0, 0, this.stackStage.position.z - this.place.stage.len * KM * 0.5).applyQuaternion(this.attQ); this.placeLabel('stagetag', add(x.r, [off.x, off.y, off.z]), true, -10); }
      else this.labels.stagetag.style.display = 'none';
    }
    // ayrılan kademelerin işaretçileri ve etiketleri: her biri kendi adıyla (TLI kademesi, Ay yörünge kademesi); yakındayken (model görünür) işaretçi çizilmez
    const seenMk = new Set();
    for (const d of extra.debris || []) {
      let e = this.debrisMarkers.get(d.id);
      if (!e) {
        const el = document.createElement('div'); el.className = 'lbl lbl-stage'; el.textContent = d.name || 'Kademe'; this.labelsEl.appendChild(el);
        e = { mk: this.makeMarker(0x9aa3b5, 0.014), key: 'deb' + d.id }; this.labels[e.key] = el; this.debrisMarkers.set(d.id, e);
      }
      const far = norm(sub(d.r, eye)) > 1.5; e.mk.visible = far; rel(d.r, e.mk.position); this.placeLabel(e.key, d.r, far, 12); seenMk.add(d.id);
    }
    for (const [id, e] of this.debrisMarkers) if (!seenMk.has(id)) { e.mk.visible = false; this.labels[e.key].style.display = 'none'; }
    this.placeLabel('site', siteG, this.siteMarker.visible, 12);
    this.updateCelestial(t, rm, eye);
    // yıldızlar: aydınlık Ay yüzeyine ya da gündüz Dünya'ya pozlanan kamerada görünmez (Apollo fotoğraflarındaki gibi)
    const onSurface = extra.local && extra.local.p[2] < 30;
    this.stars.material.color.setScalar(onSurface ? 0.08 : 0.55);
    this.central = central; this.info = info;
    if (this.cine.on) this.applyCineVis();
  }

  // efektler: ayrılma parlaması/pufları ve iniş motorunun kaldırdığı Ay tozu
  updateFx(dt, x, extra, info, zNow, rel, sd, lit, k, thr) {
    const H = this.canvas.clientHeight || 800, fov = this.camera.fov, t = x.t, rm = info.rm;
    this.dust.setView(H, fov); this.puffs.setView(H, fov);
    const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    // --- ayrılma: yeni ayrılan kademe → parlama + pufları (ayrılma düzleminde halka)
    const deb = extra.debris || [], nDeb = deb.length;
    if (this._nDeb !== undefined && nDeb > this._nDeb && info.vehPos) {
      const d = deb[nDeb - 1], zSep = d.kind === 'orb' ? -3.05 : -(3.05 + (this.nStages > 2 ? this.place.orb.len : 0));
      const q = this.attQ, ax = new THREE.Vector3(0, 0, 1).applyQuaternion(q), bx = new THREE.Vector3(1, 0, 0).applyQuaternion(q), by = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const c = ax.clone().multiplyScalar(zSep);
      this.puffs.spawn(c.x, c.y, c.z, 0, 0, 0, 9, 0.42, 1.0);                                  // parlama
      for (let i = 0; i < 70; i++) {
        const th = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 7.5, ct = Math.cos(th), st = Math.sin(th), ax_ = (Math.random() - 0.5) * 3;
        const rx = bx.x * ct + by.x * st, ry = bx.y * ct + by.y * st, rz = bx.z * ct + by.z * st, r0 = 1.4 + Math.random() * 0.6;
        this.puffs.spawn(c.x + rx * r0, c.y + ry * r0, c.z + rz * r0, rx * sp + ax.x * ax_, ry * sp + ax.y * ax_, rz * sp + ax.z * ax_, 0.45 + Math.random() * 0.8, 0.9 + Math.random() * 1.1, 0.55 + Math.random() * 0.3);
      }
    }
    this._nDeb = nDeb;
    rel(info.vehPos, this.puffs.group.position); this.puffs.update(dt);
    // --- Ay tozu: son kademe (iniş aracı) motoru yere yakınken yüzeye çarpan plümün radyal savurduğu toz; yerel çerçeve: iniş yerinde (x: yaklaşma ekseni, z: dikey), Ay'la döner
    const lander = k === this.nStages - 1;
    const dg = this.dust;
    if (info.central === 'M') {
      const up = unit(siteIcrf(t)), sitePt = add(rm, siteIcrf(t)), axA = info.drAxis || unit(cross([0, 0, 1], up)), xx = unit(sub(axA, scale(up, dot(axA, up)))), yy = cross(up, xx);
      this._m4 = this._m4 || new THREE.Matrix4(); this._m4.makeBasis(V3(xx), V3(yy), V3(up)); dg.group.quaternion.setFromRotationMatrix(this._m4); rel(sitePt, dg.group.position);
      if (lander && thr > 0.02) {
        const zA = [zNow.x, zNow.y, zNow.z], eng = add(info.vehPos, scale(zA, this.place.lander.exitZ * KM)), h = dot(sub(eng, sitePt), up) * 1000, cosT = dot(zA, up);
        if (h > 0.4 && h < 48 && cosT > 0.5) {
          const imp = add(eng, scale(zA, -(h / cosT) * KM)), px = dot(sub(imp, sitePt), xx) * 1000, py = dot(sub(imp, sitePt), yy) * 1000;
          const rate = 4200 * Math.min(1, thr * 1.4) * (1 - Math.min(1, Math.max(0, (h - 6) / 42))), nn = rate * dt + Math.random();
          const sinE = Math.max(0, dot(unit(sub(E.sunPos(t), sitePt)), up));
          for (let i = 0; i < Math.floor(nn); i++) {            // ince parçacıklar, yere yakın radyal tabaka (vakumda sürtünme/bulut yok): yatay hız baskın, dikey küçük
            const th = Math.random() * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th), sp = (7 + Math.random() * 46) * (0.55 + 0.7 * Math.min(1, thr)), r0 = 0.5 + h * 0.1 * Math.random();
            dg.spawn(px + ct * r0, py + st * r0, 0.05, ct * sp, st * sp, 0.15 + Math.random() * 1.9 * Math.min(1, 12 / (h + 2)), 0.22 + Math.random() * 0.6, 3 + Math.random() * 3, 0.26 + Math.random() * 0.22);
          }
          dg.mat.uniforms.uLit.value = 0.1 + SUN_I * 0.62 * sinE * lit;
        }
      }
      dg.update(dt, [0, 0, -1.62], 0);
    } else if (dg.n) dg.update(dt, [0, 0, -1.62], 0);
    if (!lander || info.central !== 'M') { /* yer çerçevesi yok: mevcut parçacıklar kendi ömrüyle söner */ }
  }

  // dolaylı ışık: Dünya ve Ay'ın aracı aydınlatan yansıması (earthshine, moonshine). Harita +z'de bir ışık lekesi taşır; leke cisme doğru döndürülür, şiddeti
  //   albedo × Güneş aydınlığı × (araçtan görünen Güneş'in aydınlattığı kesir) × (açısal alanın haritadaki lekeye oranı, sin²) olur: LEO'da güçlü mavi dolgu, Ay mesafesinde ihmal edilebilir.
  updateEnv(vehPos, sun, rm, lit) {
    const sunU = unit(sub(sun, vehPos)), k0 = Math.sin(ENV_HALF_DEG * Math.PI / 180) ** 2;
    let best = null;
    for (const [c, R, alb, tex] of [[[0, 0, 0], E.R_E, 0.30, this.env.earth], [rm, E.R_M, 0.12, this.env.moon]]) {
      const d = sub(c, vehPos), D = norm(d); if (D < R * 1.0005) continue;
      const f = 0.5 + 0.5 * dot(unit(sub(vehPos, c)), sunU), sa2 = Math.min(1, (R / D) ** 2);
      const I = alb * SUN_I * f * Math.min(1.15, sa2 / k0) * lit;
      if (!best || I > best.I) best = { I, d, tex };
    }
    if (!best) { this.scene.environmentIntensity = 0; return; }
    this._ev = this._ev || { a: new THREE.Vector3(), z: new THREE.Vector3(0, 0, 1), q: new THREE.Quaternion() };
    this._ev.a.set(best.d[0], best.d[1], best.d[2]).normalize();
    this._ev.q.setFromUnitVectors(this._ev.a, this._ev.z);                          // ortam çevirimi örneklenen yönü döndürür: cisim yönü → harita +z
    this.scene.environment = best.tex; this.scene.environmentRotation.setFromQuaternion(this._ev.q);
    this.scene.environmentIntensity = best.I;
  }



  // iniş arazisi yaması: yalnız yakınken çizilir; uzakta (yama ~0,25°'nin altında) hem yama hem Ay küresindeki delik kapatılır (yarım milyon üçgen ve delik gölgelendirme işi kalmaz)
  placeTerrain(rm, Mme, eye, rel) {
    const sp = add(rm, mtv(Mme, this.terrainSite)), near = norm(sub(sp, eye)) < TERRAIN_FAR_KM;
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
    for (const [layer, body] of [[this.earthTiles, this.earth], [this.earthWeld, this.earth], [this.earthHls, this.earth], [this.moonTiles, this.moon], [this.moonTiles2, this.moon]]) {
      if (!layer || !body.visible || layer.userOn === false) { if (layer) layer.setEnabled(false); continue; }
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
    const showMode = this.earthTiles && this.earthTiles.stats.drawn > 0 && this.earth.visible, label = { weld: 'Dünya yüzeyi: Landsat 30 m (bulutsuz, ~2000 görüntüleri)', hls: 'Dünya yüzeyi: güncel HLS 30 m (Sentinel-2/Landsat; bulutlu, yamalı)', bm: 'Dünya yüzeyi: Blue Marble ≈490 m' }[this.earthDetail] + '  ⟳';
    if (mb.hidden === showMode) mb.hidden = !showMode;
    if (showMode && this.tileModeTxt !== label) { this.tileModeTxt = label; mb.textContent = label; mb.title = 'Tıklayın: Landsat (temiz) → güncel HLS → yalnız Blue Marble'; }
    // kullanıcıya geri bildirim: yüzey ayrıntısı iniyor mu, alınamıyor mu
    let el = this.tileStatusEl; if (!el) { el = this.tileStatusEl = document.createElement('div'); el.className = 'tilestatus'; el.hidden = true; document.body.appendChild(el); }
    const msg = pending > 0 ? `Yüzey ayrıntısı yükleniyor… (${pending})` : (failed > 0 && loaded === 0 && drawn === 0 ? 'Yüzey ayrıntısı alınamadı: NASA parça sunucusuna erişilemiyor (ağ/reklam engelleyici?)' : '');
    if (msg !== this.tileMsg) { this.tileMsg = msg; el.textContent = msg; el.hidden = !msg; el.classList.toggle('warn', msg.startsWith('Yüzey ayrıntısı alınamadı')); }
  }

  updateLines(x, t, rm, central, eye, extra) {
    // anlık (oskülatör) yörünge: merkez cisme göre; noktalar ara dizi kurmadan doğrudan GPU tamponuna yazılır
    const cen = central === 'M' ? rm : [0, 0, 0], vcen = central === 'M' ? E.moonVel(t) : [0, 0, 0];
    const mu = central === 'M' ? E.MU_M : E.MU_E;
    const r = sub(x.r, cen), v = sub(x.v, vcen), el = E.elements(r, v, mu);
    const oa = this.osc.geometry.attributes.position.array;
    const no = conicEach(el, r, mu, central === 'M' ? 60000 : 1.2e6, 721, (i, px, py, pz) => { oa[i * 3] = px + cen[0] - eye[0]; oa[i * 3 + 1] = py + cen[1] - eye[1]; oa[i * 3 + 2] = pz + cen[2] - eye[2]; });
    this.osc.geometry.setDrawRange(0, no); this.upload(this.osc.geometry.attributes.position, no);
    this.osc.material.color.set(central === 'M' ? 0xc88cff : (el.e < 1 ? 0x49b6ff : 0xff8a3d));
    this.osc.visible = !this.asc && x.phase !== 'INDI' && !(extra.local && extra.local.p[2] < 20);        // kalkışta anlık yörünge elipsi yanıltıcı (yer altına inen balistik yay)
    this.oscEl = { ...el, central };
    // iz: Dünya merkezli ve Ay merkezli ayrı (Ay yörüngesi Ay'la birlikte taşınır); noktalar fizik worker'ından gelir
    const T = this.trail;
    if (T.E.n > 39000) T.E.dropFirst(1000); if (T.M.n > 39000) T.M.dropFirst(1000);
    const nearGround = !!this.asc || (extra.local && extra.local.p[2] < 20);             // kalkışta görev izi (yörüngeye girişten sonrası) çizilmez: yatay hareket izlenimi vermesin
    const trailsOn = !nearGround && (!this.cine.on || !!this.cine.lines);                 // görünmeyecek iz tamponları doldurulmaz/yüklenmez
    this.trailLineM.visible = !nearGround; this.trailLineE.visible = !nearGround;
    const fill = (line, st, off, own) => {
      const attr = line.geometry.attributes.position, a = attr.array, n = st.fillRelative(a, off, eye);
      let m = n;
      if (n && own) { a[n * 3] = x.r[0] - eye[0]; a[n * 3 + 1] = x.r[1] - eye[1]; a[n * 3 + 2] = x.r[2] - eye[2]; m = n + 1; }       // iz ucu aracın anlık konumuna bağlanır
      line.geometry.setDrawRange(0, m); this.upload(attr, m);
    };
    if (trailsOn) { fill(this.trailLineE, T.E, [0, 0, 0], central === 'E'); fill(this.trailLineM, T.M, rm, central === 'M'); }
    // Ay'ın yolu (±4 gün)
    const mpVisible = !['EMB', 'SYSTEM', 'SOLAR'].includes(this.cam.mode) && (norm(eye) > 60000 || (norm(sub(rm, eye)) > 30000 && central === 'E'));
    if (!this.moonPathT || Math.abs(t - this.moonPathT) > 3600) {
      this.moonPathT = t; this.moonPathPts = [];
      for (let i = 0; i < 600; i++) this.moonPathPts.push(E.moonPos(t - 4 * 86400 + (i * 8 * 86400) / 599));
    }
    if (mpVisible) {
      const ma = this.moonPath.geometry.attributes.position.array;
      this.moonPathPts.forEach((p, i) => { ma[i * 3] = p[0] - eye[0]; ma[i * 3 + 1] = p[1] - eye[1]; ma[i * 3 + 2] = p[2] - eye[2]; });
      this.moonPath.geometry.setDrawRange(0, 600); this.upload(this.moonPath.geometry.attributes.position, 600);
    }
    this.moonPath.visible = mpVisible;
  }
  // tamponun yalnız kullanılan ilk n noktasını GPU'ya yükle (varsayılan: tüm dizi; 40.000 noktalık iz tamponu ~480 KB'tır)
  upload(attr, n) { attr.clearUpdateRanges(); attr.addUpdateRange(0, n * 3); attr.needsUpdate = true; }

  placeLabel(k, p, vis, dy) {
    const d = this.labels[k]; if (!d) return;
    if (!vis) { d.style.display = 'none'; return; }
    const e = this.eye, v = new THREE.Vector3(p[0] - e[0], p[1] - e[1], p[2] - e[2]).project(this.camera);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { d.style.display = 'none'; return; }
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    d.style.display = 'block'; d.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h - dy}px) translate(-50%, -100%)`;
  }

  render() {
    if (!this.ready) return;
    const now = performance.now(), raw = (now - this._lastRender) / 1000 || 0.016, dt = Math.min(0.1, raw); this._lastRender = now;
    if (this.cine.on && this.post && this.post.active) this.post.render(dt, raw); else this.renderer.render(this.scene, this.camera);
  }

  // sinematik kip: son işlem hattı (post.js) ilk kullanımda yüklenir; piksel oranı bellek için sınırlanır; işaretçi/etiket/çizgiler gizlenir (cinema.js çağırır)
  async setCinematic(on, opts = {}) {
    if (on) {
      if (!this.post) {
        this._postLoad = this._postLoad || import('./post.js').then(({ Post }) => Post.create(this.renderer, this.scene, this.camera, { onLevel: (l) => { this.cine.level = l; if (l === 'low') this.renderer.setPixelRatio(this._pr0 || 1); if (opts.onLevel) opts.onLevel(l); } }));
        this.post = await this._postLoad;
      }
      if (opts.level) { if (this.post.level !== opts.level) this.post.setLevel(opts.level); this.post.locked = true; } else this.post.locked = false;       // sabit kalite (deneme/ayar): uyarlama kapalı
      this._pr0 = this._pr0 || this.renderer.getPixelRatio();
      this.renderer.setPixelRatio(Math.min(this._pr0, this.post.prMax));
      this.cine.level = this.post.level;
    } else if (this._pr0) { this.renderer.setPixelRatio(this._pr0); this._pr0 = null; }
    this.cine.on = on;
    this.sunSprite.material.color.setScalar(on ? 3 : 1); this.sunSprite.scale.setScalar(on ? 0.03 : 0.09); this.renderer.toneMappingExposure = on ? 0.92 : 1.0;
    this.labelsEl.style.display = on ? 'none' : '';
    this.resize(this.canvas.clientWidth, this.canvas.clientHeight);
  }
  // sinematik kipte ekran işaretçileri ve çizgiler kapalı (iz çizgileri yalnız geniş çekimlerde, cine.lines)
  applyCineVis() {
    for (const o of [this.vehMarker, this.siteMarker, this.embMarker, ...this.lMarkers]) o.visible = false;
    for (const e of this.debrisMarkers.values()) e.mk.visible = false;
    for (const o of [this.stageOsc, this.moonPath, this.haloPath, this.earthAxis, this.moonAxis, this.earthMer, this.moonMer, this.embEarth, this.embMoon]) o.visible = false;
    this.osc.visible = this.osc.visible && !!this.cine.osc;                    // anlık yörünge elipsi yalnız istenen çekimlerde
    this.trailLineE.visible = this.trailLineM.visible = !!this.cine.lines;
  }
}
mixin(World, AscentView, CameraRig, SkyView);
