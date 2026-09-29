// Canlı uydu takibi: izleme listesi, gözlemci, yer izi ve kapsama dairesi (3B), geçiş tahmini ve bildirimler.
// Konumlar SatLayer'ın (CelesTrak GP + SupGP) kayıtlarından SGP4 ile; geçişler passes.js ile (Skyfield'la ~1 s uyumlu).
import * as THREE from 'three';
import * as E from './engine.js';
import * as P from './passes.js';

const LS_WATCH = 'ls19.watch.v1', LS_OBS = 'ls19.observer.v1', LS_NOTIFY = 'ls19.notify.v1';
export const CITIES = [
  { name: 'İstanbul', lat: 41.0082, lon: 28.9784, h: 0.04 }, { name: 'Ankara', lat: 39.9334, lon: 32.8597, h: 0.94 },
  { name: 'İzmir', lat: 38.4237, lon: 27.1428, h: 0.03 }, { name: 'Antalya', lat: 36.8969, lon: 30.7133, h: 0.05 },
  { name: 'Bursa', lat: 40.1885, lon: 29.0610, h: 0.10 }, { name: 'Konya', lat: 37.8746, lon: 32.4932, h: 1.02 },
  { name: 'Trabzon', lat: 41.0027, lon: 39.7168, h: 0.04 }, { name: 'Erzurum', lat: 39.9055, lon: 41.2658, h: 1.86 },
  { name: 'Diyarbakır', lat: 37.9144, lon: 40.2306, h: 0.67 }, { name: 'Van', lat: 38.5012, lon: 43.3730, h: 1.73 }];
const DEFAULT_WATCH = [25544, 48274, 20580];                 // ISS, Tiangong (Tianhe), Hubble
export const WATCH_COLORS = [0x5ee7ff, 0xff8fd8, 0xb6ff7a, 0xffc15e, 0xa99bff, 0xff7a7a, 0x7affc7, 0xfff17a];
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* özel pencere */ } };

export class Tracker {
  constructor(scene, labelsEl, sats) {
    this.scene = scene; this.labelsEl = labelsEl; this.sats = sats;
    this.watch = load(LS_WATCH, DEFAULT_WATCH).map(Number).filter(Boolean).slice(0, 12);
    this.trackOn = new Set(this.watch.slice(0, 1));             // yer izi açık olanlar (varsayılan: ilk uydu)
    this.observer = load(LS_OBS, CITIES[0]);
    this.notify = !!load(LS_NOTIFY, false);
    this.passes = []; this.passT = 0; this.timers = []; this.onChange = null; this.visOnly = true;
    this.items = new Map();                                    // id -> { sprite, label, track, trackPast, foot, color }
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.arc(32, 32, 20, 0, 7); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 6, 0, 7); g.fill();
    this.tex = new THREE.CanvasTexture(c);
    // gözlemci işareti
    this.obsMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color: 0xffffff, sizeAttenuation: false, depthTest: true, toneMapped: false }));
    this.obsMark.scale.set(0.012, 0.012, 1); this.obsMark.renderOrder = 9; scene.add(this.obsMark);
    this.obsLabel = this.mkLabel('lbl lbl-obs');
  }
  mkLabel(cls) { const d = document.createElement('div'); d.className = cls; d.style.display = 'none'; this.labelsEl.appendChild(d); return d; }
  changed() { if (this.onChange) this.onChange(); }
  colorOf(id) { const k = this.watch.indexOf(+id); return WATCH_COLORS[(k < 0 ? 0 : k) % WATCH_COLORS.length]; }

  // ---------------------------------------------------------------- liste ve gözlemci
  has(id) { return this.watch.includes(+id); }
  add(id) { id = +id; if (!id || this.has(id)) return; this.watch.push(id); save(LS_WATCH, this.watch); this.passT = 0; this.changed(); }
  remove(id) {
    id = +id; this.watch = this.watch.filter((x) => x !== id); this.trackOn.delete(id); save(LS_WATCH, this.watch);
    const it = this.items.get(id); if (it) { for (const o of [it.sprite, it.track, it.trackPast, it.foot]) this.scene.remove(o); it.label.remove(); this.items.delete(id); }
    this.passT = 0; this.changed();
  }
  toggleTrack(id) { id = +id; if (this.trackOn.has(id)) this.trackOn.delete(id); else this.trackOn.add(id); const it = this.items.get(id); if (it) it.trackT = null; this.changed(); }
  setObserver(o) {
    this.observer = { name: o.name || 'Özel konum', lat: +o.lat, lon: +o.lon, h: +(o.h || 0) }; save(LS_OBS, this.observer); this.passT = 0; this.changed();
  }
  setNotify(on) { this.notify = on; save(LS_NOTIFY, on); this.schedule(); }
  // ICRF (motor çerçevesi) <- yaklaşık ECF (GMST) : önce ECF -> TEME, sonra TEME ≈ tarihin ekvatoru -> ICRF (presesyon-nütasyon)
  ecfToIcrf(ecf, ms, t) { const g = P.gmst(ms), p = P.ecfToEci(ecf, g); return E.mtv(E.precession(t), p); }
  obsEcf() { return P.ecfFromGeodetic(this.observer.lat, this.observer.lon, this.observer.h || 0); }
  obsIcrf(t, liftKm = 0) {
    const o = this.observer, f = o.lat * Math.PI / 180, l = o.lon * Math.PI / 180, R = E.R_E + liftKm;
    const Mi = E.earthIcrfToItrf(t);                          // küresel Dünya çizimiyle uyumlu nokta
    return E.mtv(Mi, [R * Math.cos(f) * Math.cos(l), R * Math.cos(f) * Math.sin(l), R * Math.sin(f)]);
  }
  // izlenen uydunun anlık durumu (kart ve liste için)
  state(id, ms) { const rec = this.sats.satrec(id); return rec ? P.stateAt(rec, ms, this.observer) : null; }
  icrfOf(id, t) {
    const rec = this.sats.satrec(id); if (!rec) return null;
    const ms = E.utcMsFromT(t), pv = P.propagate(rec, ms); if (!pv) return null;
    return E.mtv(E.precession(t), pv.p);
  }
  name(id) { const o = this.sats.recordOf(id); return o ? o.OBJECT_NAME : `NORAD ${id}`; }

  // ---------------------------------------------------------------- geçişler (gerçek "şimdi"den 3 gün)
  computePasses(force = false) {
    const now = Date.now();
    if (!force && now - this.passT < 10 * 60000) return;
    if (!this.sats.byId) return;
    this.passT = now; const all = [];
    for (const id of this.watch) {
      const rec = this.sats.satrec(id); if (!rec) continue;
      try {
        for (const p of P.findPasses(rec, this.observer, now - 20 * 60000, 3, { minMaxEl: 10 })) all.push({ ...p, id, name: this.name(id) });
      } catch (e) { /* bozuk kayıt */ }
    }
    this.passes = all.filter((p) => p.kind === 'sabit' || p.set.ms > now).sort((a, b) => (a.rise ? a.rise.ms : 0) - (b.rise ? b.rise.ms : 0));
    this.schedule(); this.changed();
  }
  nextPass(visibleOnly = true) { const now = Date.now(); return this.passes.find((p) => p.rise && p.set.ms > now && (!visibleOnly || p.visible)) || null; }
  // bildirim: görünür geçişten 5 dk önce (sayfa açıkken)
  schedule() {
    for (const t of this.timers) clearTimeout(t); this.timers = [];
    if (!this.notify) return;
    const now = Date.now();
    for (const p of this.passes) {
      if (!p.rise || !p.visible) continue;
      const at = (p.visFrom || p.rise.ms) - 5 * 60000; if (at < now - 30000 || at - now > 24 * 3600e3) continue;
      this.timers.push(setTimeout(() => this.fire(p), Math.max(0, at - now)));
    }
  }
  fire(p) {
    const hm = (ms) => new Date(ms).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    const body = `${hm(p.visFrom || p.rise.ms)}'de ${P.compass(p.rise.az)} yönünden doğuyor, en yüksek ${Math.round(p.max.el)}° (${P.compass(p.max.az)}), ${hm(p.set.ms)}'de batıyor.`;
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification(`${p.name} geçişi 5 dk sonra`, { body, icon: 'icon-192.png', tag: 'ls19-' + p.id + '-' + p.rise.ms }); } catch (e) { /* bazı tarayıcılar */ }
    if (this.onToast) this.onToast(`${p.name} geçişi 5 dk sonra — ${body}`);
  }

  // ---------------------------------------------------------------- 3B: işaretler, yer izi, kapsama dairesi
  item(id) {
    let it = this.items.get(id); if (it) return it;
    const color = this.colorOf(id);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color, sizeAttenuation: false, depthTest: false, toneMapped: false }));
    sprite.scale.set(0.016, 0.016, 1); sprite.renderOrder = 12; this.scene.add(sprite);
    const line = (n, op) => { const l = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, toneMapped: false })); l.frustumCulled = false; l.visible = false; this.scene.add(l); return l; };
    it = { color, sprite, label: this.mkLabel('lbl lbl-watch'), track: line(320, 0.95), trackPast: line(320, 0.35), foot: line(130, 0.7), trackT: null };
    it.label.style.color = '#' + color.toString(16).padStart(6, '0');
    this.items.set(id, it); return it;
  }
  hideAll() {
    for (const it of this.items.values()) { it.sprite.visible = it.track.visible = it.trackPast.visible = it.foot.visible = false; it.label.style.display = 'none'; }
    this.obsMark.visible = false; this.obsLabel.style.display = 'none';
  }
  update(t, eye, camera, canvas, show, far) {
    if (!show) { this.hideAll(); return; }
    const ms = E.utcMsFromT(t), Mi = E.earthIcrfToItrf(t);
    const place = (d, p, dy) => {
      const v = new THREE.Vector3(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { d.style.display = 'none'; return; }
      d.style.display = 'block'; d.style.transform = `translate(${((v.x + 1) / 2) * canvas.clientWidth}px, ${((1 - v.y) / 2) * canvas.clientHeight - dy}px) translate(-50%, -100%)`;
    };
    const setLine = (l, pts) => { const a = l.geometry.attributes.position.array; for (let k = 0; k < pts.length; k++) { a[3 * k] = pts[k][0] - eye[0]; a[3 * k + 1] = pts[k][1] - eye[1]; a[3 * k + 2] = pts[k][2] - eye[2]; }
      l.geometry.setDrawRange(0, pts.length); l.geometry.attributes.position.needsUpdate = true; l.visible = pts.length > 1; };
    // ECF (yaklaşık) -> ICRF: ITRF'ye çok yakın; çizimde Dünya'yla birlikte döner
    const toIcrf = (q) => E.mtv(Mi, q);
    const keep = new Set(this.watch);
    for (const [id, it] of this.items) if (!keep.has(id)) this.remove(id);
    for (const id of this.watch) {
      const it = this.item(id), rec = this.sats.satrec(id);
      const pv = rec ? P.propagate(rec, ms) : null;
      if (!pv || far) { it.sprite.visible = it.track.visible = it.trackPast.visible = it.foot.visible = false; it.label.style.display = 'none'; continue; }
      const g = P.gmst(ms), ecf = P.eciToEcf(pv.p, g), p = toIcrf(ecf);
      it.sprite.visible = true; it.sprite.position.set(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
      it.label.textContent = this.name(id); place(it.label, p, 12);
      if (this.trackOn.has(id)) {
        if (!it.trackT || Math.abs(ms - it.trackT) > it.trackP / 60) {
          const gt = P.groundTrack(rec, ms, 0.5, 1.5, 300); it.trackT = ms; it.trackP = gt.P;
          it.pastPts = gt.pts.filter((q) => q.past).map((q) => q.p); it.futPts = gt.pts.filter((q) => !q.past).map((q) => q.p);
        }
        setLine(it.trackPast, it.pastPts.map(toIcrf)); setLine(it.track, it.futPts.map(toIcrf));
        const gd = P.geodeticFromEcf(ecf);
        setLine(it.foot, P.footprint(ecf, gd.h, 0).map(toIcrf));
      } else { it.track.visible = it.trackPast.visible = it.foot.visible = false; }
    }
    // gözlemci
    const o = this.obsIcrf(t, 0.5);
    this.obsMark.visible = !far; this.obsMark.position.set(o[0] - eye[0], o[1] - eye[1], o[2] - eye[2]);
    this.obsLabel.textContent = this.observer.name; if (far) this.obsLabel.style.display = 'none'; else place(this.obsLabel, o, 10);
  }
}
