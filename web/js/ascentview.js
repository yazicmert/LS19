// Kalkış sahnesi (scene.js'ten ayrıldı; World'e karıştırılır): tam fırlatma aracı, rampa ve çok çözünürlüklü yer görüntüsü + kabartma (padground.js), Preetham gökyüzü,
// alev ve alev ışığı, kalkış bulutu, ayrılan kademeler ve kalkış yayını kamerası (LAUNCH: yer → takip → araç üstü; kurgu launchcam.js'te).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { makeLaunchVehicle } from './rocketmodels.js';
import { LaunchSmoke } from './launchfx.js';
import { PadGround, R_M } from './padground.js';
import { Google3D, g3dSettings, g3dUsable } from './google3d.js';
import { shake as camShake } from './launchcam.js';
import { setPlume } from './fx.js';
import { add, sub, scale, dot, cross, norm, unit } from './vec3.js';

const KM = 0.001;                        // m -> km
// kalkış alevinin renkleri (sıcak çekirdek, soğuk dış, ışıma): gazyağı turuncu, katı yakıt beyaz-sarı, hidrolox soluk mavi, metan (BE-4) mavi-turuncu
const PLUME_COL = {
  kerolox: [new THREE.Color(2.6, 1.7, 0.9), new THREE.Color(0.7, 0.32, 0.12), new THREE.Color(1.7, 1.0, 0.5)],
  solid: [new THREE.Color(3.2, 2.8, 2.2), new THREE.Color(0.9, 0.6, 0.35), new THREE.Color(2.0, 1.7, 1.2)],
  hydrolox: [new THREE.Color(1.9, 2.2, 3.2), new THREE.Color(0.12, 0.24, 1.3), new THREE.Color(0.8, 1.0, 1.7)],
  methalox: [new THREE.Color(2.0, 2.0, 2.8), new THREE.Color(0.5, 0.3, 0.9), new THREE.Color(1.1, 1.0, 1.6)],
};

export class AscentView {
  // ------------------------------------------------------------------ kalkış canlandırması (ascent.js): tam fırlatma aracı
  // spec: { lv: 'saturnv' | 'sls' | 'f9' | 'fh' | 'vulcan' | 'generic', prop: 'hydrolox' | 'kerolox' } → araç grubundaki iniş aracı/kademeler gizlenir, roket gösterilir.
  // Model birimi metre, roket ekseni +Y, taban y = 0 → gövde çerçevesi (+z itki ekseni). Kademe ayrılması: kesme düzlemiyle (cut, m) alt kısım çizilmez; parça etiketli
  // olanlar (booster, fairing, las) gizlenir. null: kalkış biter, araç geri gelir.
  async setAscent(spec) {
    const veh = this.vehicle;
    if (this.asc) { veh.remove(this.asc.root); if (this.asc.smoke) this.asc.smoke.dispose(); if (this.asc.ground) this.asc.ground.dispose(); if (this.asc.g3d) this.asc.g3d.dispose(); if (this.asc.world) { this.scene.remove(this.asc.world); this.asc.world.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); } this.asc = null; }
    for (const c of veh.children) if (c.userData.ascHidden !== undefined) { c.visible = c.userData.ascHidden; delete c.userData.ascHidden; }
    this.renderer.localClippingEnabled = false;
    if (!spec) return;
    this._lvCache = this._lvCache || {};
    const glb = (k, f) => this._lvCache[k] || (this._lvCache[k] = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(this.base + f).then((g) => g.scene).catch(() => null));
    const template = spec.lv === 'saturnv' ? await glb('saturnv', 'models/rockets/saturnv.glb') : makeLaunchVehicle(spec.lv);
    if (!template) return;
    // kesme düzlemli kopya: keep = [alt, üst] (m; üst yoksa yalnız alt sınır), parça = yalnız o etiketli parça görünür
    const prep = (src, nPlanes) => {
      const m = src.clone(true), planes = Array.from({ length: nPlanes }, () => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
      m.traverse((o) => { if (!o.isMesh) return; o.material = [].concat(o.material).map((x) => { const c = x.clone(); c.clippingPlanes = planes; c.side = THREE.DoubleSide; return c; }); if (o.material.length === 1) o.material = o.material[0]; });
      const inner = new THREE.Group(); inner.rotation.x = Math.PI / 2; inner.add(m);
      const root = new THREE.Group(); root.add(inner); root.scale.setScalar(KM);
      return { root, inner, model: m, planes };
    };
    const L = prep(template, 1);
    for (const c of veh.children) { c.userData.ascHidden = c.visible; c.visible = false; }
    veh.add(L.root);
    const C = (r, g, b) => new THREE.Color(r, g, b), ker = spec.prop !== 'hydrolox', sol = spec.prop === 'solid';
    const plumeR = spec.lv === 'saturnv' ? 4.5 : spec.lv === 'sls' ? 4.0 : spec.lv === 'fh' ? 5.0 : spec.lv === 'vulcan' ? 2.4 : 1.7;
    const holder = new THREE.Group(); L.root.add(holder);
    // alev rengi: gazyağı turuncu, katı yakıt (alüminyum) parlak beyaz-sarı, hidrolox soluk
    const hot = sol ? C(3.2, 2.8, 2.2) : ker ? C(2.6, 1.7, 0.9) : C(1.9, 2.2, 3.2), cool = sol ? C(0.9, 0.6, 0.35) : ker ? C(0.7, 0.32, 0.12) : C(0.12, 0.24, 1.3);
    const flame = this._addPlume(holder, { exitZ: 0, exitR: plumeR }, plumeR * 14, hot, cool, 0.9, { widen: 2.4, diamonds: 0.3, kS: 3.0 }, sol ? C(2.0, 1.7, 1.2) : ker ? C(1.7, 1.0, 0.5) : C(0.8, 1.0, 1.7), 3.0);
    // alevin ışığı: roket gövdesini, rampayı ve kalkış bulutunu turuncu aydınlatır (alevin 3 çap altında; mesafeyle kare azalır)
    const plumeLight = new THREE.PointLight(0xffb070, 0, 0, 2); plumeLight.position.set(0, 0, -plumeR * 3); holder.add(plumeLight);
    // dünya nesneleri (kameraya göre konumlanır): gökyüzü kubbesi, rampa + yer görüntüsü, ayrılan kademeler
    const world = new THREE.Group(); this.scene.add(world);
    // gökyüzü kubbesi: derinlik testiyle (rampa, roket ve Dünya önünde kalır); yarıçap ufkun ötesine (ascentFrame) — yalnız ufkun üstünde görünür
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), await this.skyMaterial());
    sky.scale.setScalar(80); sky.renderOrder = -9; sky.frustumCulled = false; world.add(sky);
    const pad = new THREE.Group(); pad.scale.setScalar(KM); pad.matrixAutoUpdate = false; world.add(pad);
    const padProps = [];                                                                 // temsilî rampa (beton, çukur, direkler): gerçek 3B karolar varken gizlenir
    if (spec.pad === 'ml') {
      const ml = await glb('ml', 'models/rockets/ml.glb');
      // Mobile Launcher: roket ekseni modelde (−7,8; 16; 1,4) m — platform üstü yere oturur (kaideler gösterilmez)
      if (ml) { const m = ml.clone(true); m.position.set(7.77, -16, -1.41); pad.add(m); }
    } else {
      // beton (üstü zemin görüntüsünün 0,15 m üstünde: padground.js zemini rampa düzeyinden 0,25 m yukarıda) ve alev çukuru
      const conc = new THREE.Mesh(new THREE.BoxGeometry(60, 2.4, 60), new THREE.MeshLambertMaterial({ color: 0x9a978f })); conc.position.y = -0.8; pad.add(conc);
      const trench = new THREE.Mesh(new THREE.BoxGeometry(12, 2.2, 40), new THREE.MeshLambertMaterial({ color: 0x3a3936 })); trench.position.set(0, -0.55, 14); pad.add(trench);
      padProps.push(conc, trench);
      for (const [x, z] of [[-26, -26], [26, 26]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 90, 8), new THREE.MeshLambertMaterial({ color: 0xb8b6b0 })); t.position.set(x, 45, z); pad.add(t); padProps.push(t); }   // yıldırım direkleri
    }
    const len = new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3()).y;      // roket boyu (m, +Y): kalkış kamerasının kadrajı
    const radius = { saturnv: 5.05, sls: 4.2, fh: 1.83, f9: 1.83, vulcan: 2.7 }[spec.lv] || 2.0;     // gövde yarıçapı (m): araç üstü kameranın yeri
    const big = spec.lv === 'saturnv' || spec.lv === 'sls' || spec.lv === 'fh';
    const smoke = new LaunchSmoke(pad, KM, { scale: big ? 1 : 0.65, trenchDir: [0, 0, 1] });             // alev çukuru kuzey–güney (LC-39A/B gibi)
    this.asc = { root: L.root, inner: L.inner, model: L.model, plane: L.planes[0], holder, flame, plumeLight, smoke, cut: 0, spec, template, prep, world, sky, pad, padProps, debris: new Map(), state: null, credit: '', len, radius };
    // yer: rampa çevresinin iç içe uydu görüntüsü ve kabartması (kaba seviyeler önce gelir; atıf yüklenen kaynağa göre)
    if (spec.site) {
      const ground = this.asc.ground = new PadGround(THREE, pad, spec.site, { onProgress: (G) => { if (this.asc && this.asc.ground === G) this.asc.credit = G.credit(); } });
      ground.load();
      if (g3dUsable()) this.setGoogle3D(true);                                          // isteğe bağlı: rampa çevresi Google 3B karolarıyla (google3d.js)
    }
    this.renderer.localClippingEnabled = true;
  }
  // Google 3B karoları (google3d.js): kalkış sürerken aç/kapa; ayarlar (anahtar) google3d.js'te. onStatus: durum değişince (ayar paneli)
  setGoogle3D(on) {
    const A = this.asc; if (!A || !A.spec.site) return;
    if (A.g3d) { A.g3d.dispose(); A.g3d = null; if (A.ground) A.ground.u.holeR.value = 0; for (const p of A.padProps) p.visible = true; }
    const s = g3dSettings();
    if (!on || !(s.key || s.url)) { if (this.onG3dStatus) this.onG3dStatus(null); return; }
    A.g3d = new Google3D({ THREE, parent: A.pad, site: A.spec.site, key: s.key, url: s.url, renderer: this.renderer, camera: this.camera, base: this.base,
      onStatus: (g) => { if (this.onG3dStatus && this.asc && this.asc.g3d === g) this.onG3dStatus(g); } });
    A.g3d.start();
  }
  // kalkış gökyüzü: three.js resmî Sky eklentisi (Preetham analitik gün ışığı modeli: Rayleigh + Mie saçılması, Güneş konumuna göre renk, ufukta beyazlaşma).
  // Sahnenin logaritmik derinliğine uyarlanır (uzak düzleme itilmez: ufuk mesafesindeki kubbe yıldızları örter, Dünya'yı örtmez) ve irtifayla saydamlaşır (skyFade).
  // Eklenti yüklenemezse düz renkli kubbe.
  async skyMaterial() {
    try {
      const { Sky } = await import('three/addons/objects/Sky.js'), S = Sky.SkyShader;
      const vs = '#include <common>\n#include <logdepthbuf_pars_vertex>\n' + S.vertexShader.replace('gl_Position.z = gl_Position.w; // set z to camera.far', '#include <logdepthbuf_vertex>');
      const fs = '#include <logdepthbuf_pars_fragment>\nuniform float skyFade, skyGain; uniform vec3 skyTint;\n' + S.fragmentShader.replace('vec3 direction = normalize( vWorldPosition - cameraPosition );', '#include <logdepthbuf_fragment>\n\t\t\tvec3 direction = normalize( vWorldPosition - cameraPosition );')
        .replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * skyGain * skyTint, skyFade );');
      if (!vs.includes('logdepthbuf_vertex') || !fs.includes('skyFade );')) throw new Error('Sky gölgelendiricisi beklenen biçimde değil');
      const u = THREE.UniformsUtils.clone(S.uniforms); Object.assign(u, { skyFade: { value: 0 }, skyGain: { value: 0.8 }, skyTint: { value: new THREE.Vector3(1, 1, 1) } });
      u.turbidity.value = 2.6; u.rayleigh.value = 1.3; u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.8;
      const m = new THREE.ShaderMaterial({ name: 'LS19Sky', uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.BackSide, transparent: true, depthWrite: false });
      m.userData.preetham = true; return m;
    } catch (e) {
      return new THREE.MeshBasicMaterial({ color: 0x5f8fd8, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false });
    }
  }
  // kalkış karesi: o = { cut (m), hidden (Set), thr, h (km), pAmb (Pa), sunUp (Güneş yüksekliğinin sinüsü), pad: { pos, east, north, up } (çizim konumu, km),
  //   debris: [{ id, lo, hi, part, hidden, r (çizim, km), q }] } — konumlar update() içinde kameraya göre uygulanır (applyAscent)
  ascentFrame(o) {
    const A = this.asc; if (!A) return;
    A.state = o; A.cut = o.cut;
    A.model.traverse((x) => { const p = x.userData.part; if (p) x.visible = !o.hidden.has(p); });
    A.holder.position.set(0, 0, o.cut);                                                   // alev kalan yığının tabanında (gövde çerçevesi, m)
    setPlume(A.flame, o.thr);
    // alev ortam basıncı düştükçe genişler ve uzar; şok elmasları alçakta belirgin, yükseldikçe söner (aşırı/az genleşmiş jet)
    const pr = Math.max(0, Math.min(1, o.pAmb / 101325)), wid = 1 + 1.5 * Math.pow(1 - pr, 0.6), len = 1 + 0.8 * (1 - pr);
    A.flame.scale.x *= wid; A.flame.scale.y *= wid; A.flame.scale.z *= len;
    A.flame.material.uniforms.diamonds.value = 0.32 * pr;
    const g = A.flame.userData.glow; if (g) { g.visible = o.thr > 0.01; g.material.color.copy(g.userData.col).multiplyScalar(o.thr); }
    // gökyüzü: gündüz mavi, alacakaranlıkta koyu; yoğunluk ölçek yüksekliğiyle (~7 km) söner
    const day = Math.max(0, Math.min(1, (o.sunUp + 0.1) / 0.35)), op = Math.exp(-o.h / 7.5) * (0.25 + 0.75 * day);
    A.sky.scale.setScalar(Math.max(80, 1.3 * Math.sqrt(2 * 6378 * Math.max(0.3, o.h))));                 // ufuk uzaklığı √(2 R h) ötesi
    // alev rengi o anda yanan kademenin yakıtına göre (ör. Saturn V: S-IC gazyağı → S-II/S-IVB hidrolox)
    if (o.prop && o.prop !== A.propNow) { A.propNow = o.prop; const c = PLUME_COL[o.prop] || PLUME_COL.kerolox; const u = A.flame.material.uniforms; u.hot.value.copy(c[0]); u.cool.value.copy(c[1]); const gl = A.flame.userData.glow; if (gl) gl.userData.col.copy(c[2]); }
    const SM = A.sky.material;                                                         // gökyüzü irtifayla saydamlaşır: 15 km'de koyu mavi, ~60 km üstünde siyah
    if (SM.userData.preetham) {
      // irtifada gökyüzü koyulaşırken griye değil laciverde döner (saçılan ışık maviye kayar; Preetham modeli gözlemciyi yerde varsayar)
      const hb = Math.max(0, Math.min(1, (o.h - 2) / 23)), sb = hb * hb * (3 - 2 * hb); SM.uniforms.skyTint.value.set(1 - 0.5 * sb, 1 - 0.25 * sb, 1 + 0.4 * sb);
      SM.uniforms.skyFade.value = Math.min(0.985, Math.exp(-o.h / 22) * (0.35 + 0.65 * day)); if (o.sunDir) SM.uniforms.sunPosition.value.set(...o.sunDir); if (o.upV) SM.uniforms.up.value.set(...o.upV); }
    else { SM.opacity = Math.min(0.97, op); SM.color.setRGB(0.04 + 0.30 * day, 0.06 + 0.50 * day, 0.12 + 0.82 * day); }
    // alev ışığı: itkiyle, yakıt rengine göre (gece kalkışında gövde ve bulut belirgin turuncu)
    if (A.plumeLight) { const c = (PLUME_COL[o.prop] || PLUME_COL.kerolox)[2]; A.plumeLight.color.setRGB(c.r, c.g, c.b).multiplyScalar(1 / Math.max(c.r, c.g, c.b)); A.plumeLight.intensity = 0.006 * o.thr * (1 + 0.6 * (1 - day)); }
  }
  // update() içinden: kameraya göre konumlar (rel) — rampa, kademe parçaları, gökyüzü
  applyAscent(rel) {
    const A = this.asc, o = A && A.state; if (!o) return;
    A.root.updateMatrixWorld(true);
    const base = A.inner.localToWorld(new THREE.Vector3(0, o.cut, 0)), tip = A.inner.localToWorld(new THREE.Vector3(0, o.cut + 1, 0));
    A.plane.setFromNormalAndCoplanarPoint(tip.sub(base).normalize(), base);
    A.sky.position.set(0, 0, 0);
    if (o.pad) {
      const P = o.pad, p = rel(P.pos), E3 = new THREE.Vector3(...P.east), U = new THREE.Vector3(...P.up), S = new THREE.Vector3(...P.north).multiplyScalar(-1);
      A.pad.matrix.makeBasis(E3, U, S).scale(new THREE.Vector3(KM, KM, KM)).setPosition(p); A.pad.matrixWorldNeedsUpdate = true;
      if (A.ground) {                                                                      // zemin: Güneş, kamera irtifası (pus), alevin ışığı (dünya km)
        const plume = PLUME_COL[o.prop] || PLUME_COL.kerolox, pc = plume[2], pm = Math.max(pc.r, pc.g, pc.b);
        const camH = Math.max(0, this.earth.position.length() - R_M / 1000);
        A.ground.frame({ sunDir: o.sunDir, sunUp: o.sunUp, h: camH, plumeW: base, thr: o.thr, plumeCol: pc.clone().multiplyScalar(1 / pm) });
        if (A.g3d) {                                                                     // Google 3B: aynı ışık/pus; hazırken zemin içeriyi boşaltır, temsilî rampa gizlenir
          A.g3d.frame(A.ground.u, camH);
          const on = A.g3d.ready && A.g3d.visible; A.ground.u.holeR.value = on ? A.g3d.radiusM * 0.985 : 0;
          for (const p of A.padProps) if (p.visible === on) p.visible = !on;
          const now = performance.now(); if (!A.creditT || now - A.creditT > 1000) { A.creditT = now; const g = A.g3d.attribution(); A.credit = A.ground.credit() + (g ? ' · ' + g : ''); }
        }
      }
      if (A.smoke) {                                                                       // kalkış bulutu rampa çerçevesinde (m): roket tabanı ve kamera oraya taşınır
        const inv = A.pad.matrix.clone().invert(), rb = base.clone().applyMatrix4(inv), cm = new THREE.Vector3().applyMatrix4(inv);
        A.smoke.update(o.met ?? 0, o.dtFlight ?? 0, { rocket: [rb.x, rb.y, rb.z], thr: o.thr, sunUp: o.sunUp, cam: [cm.x, cm.y, cm.z], sunDir: o.sunDir });
      }
    }
    const seen = new Set();
    for (const d of o.debris || []) {
      let e = A.debris.get(d.id);
      if (!e) {
        e = A.prep(A.template, 2); A.world.add(e.root); A.debris.set(d.id, e);
        e.model.traverse((x) => { if (x.isMesh) x.visible = !d.part; });
        if (d.part) e.model.traverse((x) => { if (x.userData.part === d.part) x.traverse((y) => { y.visible = true; }); });
        else e.model.traverse((x) => { const p = x.userData.part; if (p && d.hidden.includes(p)) x.visible = false; });
      }
      rel(d.r, e.root.position); e.root.quaternion.set(d.q[0], d.q[1], d.q[2], d.q[3]); e.root.updateMatrixWorld(true);
      const lo = d.part ? -1e4 : d.lo, hi = d.part ? 1e4 : d.hi;
      const b0 = e.inner.localToWorld(new THREE.Vector3(0, lo, 0)), b1 = e.inner.localToWorld(new THREE.Vector3(0, hi, 0)), n = b1.clone().sub(b0).normalize();
      e.planes[0].setFromNormalAndCoplanarPoint(n, b0); e.planes[1].setFromNormalAndCoplanarPoint(n.clone().negate(), b1);
      seen.add(d.id);
    }
    for (const [id, e] of A.debris) if (!seen.has(id)) { A.world.remove(e.root); A.debris.delete(id); }
  }

  // LAUNCH (kalkış canlandırması): yayınlardaki gibi önce YER kamerası — rampanın yanında (uçuş yönüne dik, ~1,4 km), yerden ~12 m yukarıda, tele
  // objektifle roketi izler (roket kadraj yüksekliğinin ~yarısı); dikey kalkış rampaya ve ufka göre görünür, yunuslama (pitch) yandan, profilden izlenir.
  // İrtifa 1,5 → 4,5 km arasında yumuşakça TAKİP kamerasına geçer: roketin arkasından (cam.az/el/dist; sürüklenebilir), yerel dikey yukarı, ufuk kadrajda.
  launchPose(x, info) {
    const c = this.cam;
    const sph = (az, el) => [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    const fromBasis = (B, d) => add(add(scale(B[0], d[0]), scale(B[1], d[1])), scale(B[2], d[2]));
    if (!(this.asc && this.asc.state && this.asc.state.pad && info.axis)) return null;
    const o = this.asc.state, P = o.pad, h = o.h || 0, L = (this.asc.len || 60) / 1000, shot = (o.shot && o.shot.shot) || 'track', met = o.met || 0;
    const cutK = (o.cut || 0) / 1000, base = add(info.vehPos, scale(info.axis, cutK)), mid = add(info.vehPos, scale(info.axis, (cutK + L) / 2));   // kalan yığının tabanı ve ortası
    const up = P.up, dr = P.dr || P.east, side = cross(up, dr);
    const z = unit(x.r), hv = sub(x.v, scale(z, dot(x.v, z))), xx = norm(hv) > 1e-6 ? unit(hv) : dr, y = cross(z, xx);
    const key = o.shot ? o.shot.key : shot; if (key !== this.ascShotKey) { this.ascShotKey = key; this.ascAim = null; }       // kesme: operatör gecikmesi sıfırlanır
    const sh = (eye, dist) => add(eye, camShake(shot, met, { thr: o.thr, q: o.q || 0, dist }));
    // yer kameraları: operatör roketi biraz gecikmeli izler (tele objektifte roket kadrajda hafif kayar)
    const aimLag = (eye, tgt, tau) => {
      const d = unit(sub(tgt, eye)), k = 1 - Math.exp(-(this._dtCam || 0.016) / tau);
      this.ascAim = this.ascAim ? unit(add(scale(this.ascAim, 1 - k), scale(d, k))) : d; return add(eye, scale(this.ascAim, norm(sub(tgt, eye))));
    };
    const fovFit = (span, d, lo = 2.5, hi = 55) => Math.min(hi, Math.max(lo, 2 * Math.atan(span * 0.62 / d) * 180 / Math.PI));
    // yer kamerası kabartmanın (dağlık rampalar: Xichang, Vandenberg) altında kalmasın: o noktadaki zeminin en az 'clear' m üstüne kaldırılır
    const G = this.asc.ground, north = P.north;
    const G3 = this.asc.g3d && this.asc.g3d.ready && this.asc.g3d.visible ? this.asc.g3d : null;
    const lift = (eye, clear) => {
      if (!G || (!G.heightAt && !G3)) return eye;
      const rl = sub(eye, P.pos), e = dot(rl, P.east) * 1000, s = -dot(rl, north) * 1000, hy = dot(rl, up) * 1000;
      const g3 = G3 ? G3.surfaceAt(e, s) : null, gy = Math.max(G.heightAt ? G.groundAt(e, s) : 0, g3 ?? -1e9);   // 3B karolarda bina/ağaç tepesi de
      return hy < gy + clear ? add(eye, scale(up, (gy + clear - hy) / 1000)) : eye;
    };
    if (shot === 'wide') {                                                               // geri sayım: ~2,7 km'den, 120 m yükseklikten alçak hava çekimi — roket, rampa kompleksi ve
      // ufuk birlikte (yatık bakış ~2–4°: gerçek rampa görüntüsü şeritlenmeden görünür); kamera yavaşça yana kayar (yayınlardaki helikopter/dron çekimi gibi)
      const drift = (met + 10) * 0.012, g = lift(add(add(P.pos, scale(side, -2.6 + drift * 0.3)), add(scale(dr, -0.8 + drift), scale(up, 0.12))), 60);
      const tg = add(P.pos, scale(up, L * 0.7)), d = norm(sub(tg, g));
      return { eye: g, target: tg, up, fov: fovFit(L * 3.2, d) };
    }
    if (shot === 'pad') {                                                                // rampa dibi: 160 m'den, yerden 3 m, motorlara ve aleve yukarı bakan geniş açı
      const g = lift(add(add(P.pos, scale(side, -0.13)), add(scale(dr, 0.09), scale(up, 0.003))), 3), tg = add(info.vehPos, scale(info.axis, L * 0.38));
      return { eye: sh(g, 0.16), target: aimLag(g, tg, 0.12), up, fov: 46 };
    }
    if (shot === 'onboard') {                                                            // araç üstü: gövdenin yanında, aşağı (geriye) bakar; Dünya ve alev, ayrılan kademe
      const q = this.attQ, rad = new THREE.Vector3(1, 0, 0).applyQuaternion(q), rd = [rad.x, rad.y, rad.z], ax = info.axis;
      const R = (this.asc.radius || 2) / 1000, m = o.shot.mount != null ? o.shot.mount / 1000 : L * 0.62;
      const e = add(add(info.vehPos, scale(ax, m)), scale(rd, R + 0.0028));                 // gövdeden 2,8 m dışarıda, ~9° dışa eğik
      const tg = add(add(e, scale(ax, -0.08)), scale(rd, 0.0125));
      return { eye: sh(e, 1), target: tg, up: rd, fov: 62 };
    }
    const g = lift(add(add(P.pos, scale(side, -1.4)), add(scale(dr, -0.42), scale(up, 0.012))), 12);      // yer izleme: uçuş yönü kadrajın sağına akar
    // kadraj: roketin tepesinden aşağıda rampaya (yükseldikçe en çok 2,5 roket boyu aşağıya) kadar — rampa ve ufuk kalkışta kadrajda kalır, sonra roket izlenir
    const a = Math.max(0, dot(sub(base, P.pos), up)), top = add(info.vehPos, scale(info.axis, L * 1.05)), bot = sub(base, scale(up, Math.min(a + 0.03, 2.5 * L)));
    const tG = scale(add(top, bot), 0.5), span = norm(sub(top, bot)), dG = norm(sub(tG, g)), fovG = fovFit(span, dG, 2.5, 50);
    const eC = add(mid, scale(fromBasis([xx, y, z], sph(c.az, c.el)), c.dist));
    if (shot === 'chase') return { eye: sh(eC, 1), target: mid, up: z, fov: 50 };
    const u = Math.max(0, Math.min(1, (h - 1.5) / 3)), w = u * u * (3 - 2 * u), tgL = aimLag(g, tG, 0.35);
    return { eye: add(scale(sh(g, dG), 1 - w), scale(eC, w)), target: add(scale(tgL, 1 - w), scale(mid, w)), up: unit(add(scale(up, 1 - w), scale(z, w))), fov: fovG + (50 - fovG) * w };
  }
}
