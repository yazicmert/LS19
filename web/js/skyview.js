// Gök cisimleri ve Canlı Gökyüzü (scene.js'ten ayrıldı; World'e karıştırılır): gezegen konumları ve bilgisi, odak cismi, Canlı Gökyüzü kipi
// (araçsız, gerçek saat), Dünya–Ay kütle merkezi, gezegen/uydu dönüşleri, yörünge çizimleri ve gezegen seçme.
import * as THREE from 'three';
import * as E from './engine.js';
import { BODIES } from './ephem.js';
import { etOf } from './live.js';
import { PLANETS, planetQuaternion, loadPlanetTextures } from './planets.js';
import { conicPoints, m3ToQuat, unit3, SUN_I } from './scenegeom.js';
import * as CR from './cr3bp.js';
import { K_EMB } from './camerarig.js';
import { add, sub, scale, dot, norm, unit } from './vec3.js';

export class SkyView {
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
  // ---------------------------------------------------------------- Canlı Gökyüzü: araçsız, gerçek saatle çizim
  setSkyMode(on) {
    this.skyMode = on;
    for (const o of [this.vehicle, this.vehMarker, this.siteMarker, this.osc, this.trailLineE, this.trailLineM, this.stageOsc, this.haloPath, ...this.lMarkers]) o.visible = !on && o !== this.haloPath;
    if (on) { for (const m of this.debrisMeshes.values()) m.visible = false; for (const e of this.debrisMarkers.values()) { e.mk.visible = false; this.labels[e.key].style.display = 'none'; } for (const k of ['veh', 'site', 'lp', 'lp2']) if (this.labels[k]) this.labels[k].style.display = 'none'; }
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
    this.updateTiles();
    if (this.terrainReady) this.placeTerrain(rm, Mme, eye, rel);
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
}
