// Kamera düzeni (scene.js'ten ayrıldı; World'e karıştırılır): kamera kiplerinin pozları (Dünya, Ay, sistem, odak, gözlemci, Güneş, iniş yeri, araç;
// kalkış yayını ascentview.js'te), yakın kipler arası yumuşak geçiş, sinematik görüş açısı, görev evresine göre otomatik kamera, yedek yönelim.
import * as E from './engine.js';
import { siteIcrf } from './mission.js';
import { m3ToQuat, bodyMatrix } from './scenegeom.js';
import { add, sub, scale, dot, cross, norm, unit } from './vec3.js';

export const K_EMB = E.MU_M / (E.MU_E + E.MU_M);          // Dünya–Ay kütle merkezi: Dünya'dan Ay'a doğru bu oranda
const LANDING_PH = new Set(['PDI', 'YAKLASMA', 'SON_INIS', 'INDI']);          // motorlu iniş evreleri: araç kamerası yaklaşma eksenine bağlanır
const CAM_BLEND_S = 1.4;                                                         // yakın kameralar arası geçiş süresi (gerçek s)

export class CameraRig {
  // ---------------------------------------------------------------- kamera
  cameraPose(x, info) {
    const c = this.cam, t = x.t, rm = info.rm;
    const sph = (az, el) => [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    const fromBasis = (B, d) => add(add(scale(B[0], d[0]), scale(B[1], d[1])), scale(B[2], d[2]));
    if (c.mode === 'CINE' && this.cine.rig) { const p = this.cine.rig(x, info, this); if (p) return p; }
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
      const lookEl = Math.max(0.02, elev - ((fov / 2 - 5) * Math.PI) / 180 * (elev > 0.05 ? 1 : 0));
      const hdir = unit(dh), tdir = add(scale(hdir, Math.cos(Math.min(lookEl, elev))), scale(up, Math.sin(Math.min(lookEl, elev))));
      return { eye: obs, target: add(obs, tdir), up, fov };
    }
    if (c.mode === 'LAUNCH') { const lp = this.launchPose(x, info); if (lp) return lp; }      // kalkış yayını kamerası (ascentview.js)
    // VEHICLE: merkez cisme göre yerel dikey çerçeve (x: hızın yatay izdüşümü). Motorlu inişte x, yaklaşma ekseni (iniş yerine bağlı, sabit) olur: yüzeye göre hız sıfıra yaklaşırken
    // eylemsiz hızın yönü oynar (Ay'ın dönmesi ~4,6 m/s, yatay hız bundan küçük); hıza bağlı çerçeve kamerayı aracın çevresinde döndürür, arazi sallanır.
    const cen = info.central === 'M' ? rm : [0, 0, 0], vcen = info.central === 'M' ? E.moonVel(t) : [0, 0, 0];
    const z = unit(sub(x.r, cen)), vv = sub(x.v, vcen);
    let hx = sub(vv, scale(z, dot(vv, z)));
    if (info.central === 'M' && info.drAxis && LANDING_PH.has(x.phase)) hx = sub(info.drAxis, scale(z, dot(info.drAxis, z)));
    const xx = unit(hx), y = cross(z, xx);
    return { eye: add(info.vehPos, scale(fromBasis([xx, y, z], sph(c.az, c.el)), c.dist)), target: info.vehPos, up: z, fov: 50 };
  }

  // kamera pozu; otomatik kamera yakın kipler arasında (araç ↔ iniş yeri) geçerken önceki ve yeni poz süre boyunca yumuşak (smoothstep) harmanlanır, görüş açısı da.
  blendedPose(x, info, dt) {
    this._dtCam = Math.min(0.1, dt || 0.016);
    let pose = this.cameraPose(x, info);
    const b = this.camBlend;
    if (b) {
      b.p += Math.min(0.1, dt) / CAM_BLEND_S;
      if (b.p >= 1) this.camBlend = null;
      else {
        const cur = this.cam; this.cam = b.from;
        let p0; try { p0 = this.cameraPose(x, info); } finally { this.cam = cur; }
        const f = b.p * b.p * (3 - 2 * b.p), mix = (a, c) => [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, a[2] + (c[2] - a[2]) * f];
        pose = { eye: mix(p0.eye, pose.eye), target: mix(p0.target, pose.target), up: unit(mix(p0.up, pose.up)), fov: (p0.fov ?? 50) + ((pose.fov ?? 50) - (p0.fov ?? 50)) * f };
      }
    }
    const fov = pose.fov !== undefined && this.cam.mode === 'CINE' ? this.cineFov(pose.fov) : pose.fov;
    if (fov !== undefined && Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    return pose;
  }
  // dar ya da dikey pencerede (telefon) yatay görüş alanı daralmasın: sinematik kamerada dikey görüş açısı en-boy oranına göre genişler (1,4'ten geniş pencerede değişmez)
  cineFov(fov) {
    const a = this.camera.aspect || 1.78, k = Math.min(2.2, Math.max(1, 1.4 / a));
    return k > 1.001 ? (2 * Math.atan(Math.tan(fov * Math.PI / 360) * k) * 180) / Math.PI : fov;
  }

  autoCamera(x, info) {
    if (this.cam.mode !== 'SITE' && this.cam.mode !== 'OBS' && this.cam.mode !== 'CINE' && this.cam.mode !== 'LAUNCH' && this.camera.fov !== 50 && !this.camBlend) { this.camera.fov = 50; this.camera.updateProjectionMatrix(); }
    if (!this.cam.auto) { this.camBlend = null; return; }
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
      const near = (m) => m === 'VEHICLE' || m === 'SITE';                      // yakın kameralar arası geçişte kamera sıçramaz, yumuşak süzülür
      if (this.cam.key && near(this.cam.mode) && near(set.mode)) this.camBlend = { from: { ...this.cam }, p: 0 };
      else this.camBlend = null;
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

  // yönelimi olmayan fizik sürücüsü için (uyumluluk kipi): itki yönü / ileri yön / inişte yerel dikey, anlık; fizikten gelen x.q varken kullanılmaz
  fallbackAttitude(x, central, rm, t) {
    let zDir;
    if (x.phase === 'INDI' || x.phase === 'SON_INIS' || x.phase === 'YAKLASMA') zDir = unit(siteIcrf(t));
    else if (x.thr > 0 && x.u && norm(x.u) > 0) zDir = x.u;
    else zDir = unit(central === 'M' ? sub(x.v, E.moonVel(t)) : x.v);
    return m3ToQuat(bodyMatrix(zDir, central === 'M' ? unit(sub(x.r, rm)) : unit(x.r)));
  }

}
