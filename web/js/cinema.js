// LS19 sinematik "fragman" yönetmeni: görevi baştan oynatır, çekim listesine göre kamerayı ve zaman hızını yönetir, bölüm kartlarını gösterir.
//   · Çekimler görev planındaki olaylara (INS, TLI, SEP, MCC, LOI, DOI, SEP2, PDI, INDI) bağlıdır; her çekimin gerçek süresi (dur) ve "gerçek süre → benzetim zamanı" eğrisi (T) vardır.
//   · Zaman hızı kapalı çevrim: istenen benzetim zamanı eğrisinden ileri besleme + hata düzeltmesi (fizik worker'ına 'warp' komutu); yakış sırasında sınır, böylece yakışlar atlanmaz.
//   · Kamera düzenekleri: LVLH (araç çevresi), gövde çerçevesi (motor yakın planı), omuz üstü (Dünya/Ay arkada), iniş yeri (yerden), geniş (Dünya/Ay/Sistem). scene.js 'CINE' kipi bunları çağırır.
//   · Bindirmeler cinemaui.js + css/cinema.css; son işlem (bloom, film) scene.js setCinematic → post.js.
import * as THREE from 'three';
import * as E from './engine.js';
import { siteIcrf } from './mission.js';
import { CineUI } from './cinemaui.js';

const { add, sub, scale, dot, cross, norm, unit } = E;
const KM = 0.001;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => { k = clamp(k, 0, 1); return k * k * k * (k * (k * 6 - 15) + 10); };
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
// görev süresi gösterimi (ui.js fmtDur ile aynı biçim: 4g 06:32:06)
export function fmtDur(s) {
  const neg = s < 0; s = Math.abs(s);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), z = (x) => String(x).padStart(2, '0');
  return (neg ? '−' : '') + (d ? `${d}g ` : '') + `${z(h)}:${z(m)}:${z(sec)}`;
}
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const arr = (v) => [v.x, v.y, v.z];

// ---------------------------------------------------------------- tekdüze monoton kübik (PCHIP): gerçek süre (τ) → benzetim zamanı; türevi ileri besleme zaman hızıdır
export function pchip(xs, ys) {
  const n = xs.length, h = [], d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { h[i] = Math.max(1e-9, xs[i + 1] - xs[i]); d[i] = (ys[i + 1] - ys[i]) / h[i]; }
  const end = (h0, h1, d0, d1) => { let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1); if (Math.sign(s) !== Math.sign(d0)) s = 0; else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > 3 * Math.abs(d0)) s = 3 * d0; return s; };
  if (n === 2) m[0] = m[1] = d[0];
  else {
    for (let i = 1; i < n - 1; i++) { if (d[i - 1] * d[i] <= 0) m[i] = 0; else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); } }
    m[0] = end(h[0], h[1], d[0], d[1]); m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  }
  return (x) => {
    x = clamp(x, xs[0], xs[n - 1]); let i = 0; while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
    const dy = ((6 * t2 - 6 * t) * ys[i] + (3 * t2 - 4 * t + 1) * h[i] * m[i] + (-6 * t2 + 6 * t) * ys[i + 1] + (3 * t2 - 2 * t) * h[i] * m[i + 1]) / h[i];
    return [y, Math.max(0, dy)];
  };
}

// ---------------------------------------------------------------- araç çerçeveleri ve düzenek yardımcıları
// etkin motor çıkışının, yığının üst ve alt ucunun gövde z'si (m): scene.js place/yığın düzeniyle aynı
function stackZ(W, x) {
  const P = W.place, k = x.k || 0, nSt = W.nStages, last = nSt - 1, orbLen = nSt > 2 ? P.orb.len : 0, top = 3.05 + orbLen;
  const engine = k === last ? P.lander.exitZ : (nSt > 2 && k === 1) ? -3.05 + P.orb.exitZ : -top + P.stage.exitZ;
  const bottom = k === last ? -2.9 : engine;
  return { engine, top: 1.1, bottom, mid: (1.1 + bottom) / 2 };
}
// kamera pozunu mevcut (VEHICLE/EARTH/MOON/SYSTEM/EMB/SITE) kamera kipiyle hesapla: scene.cameraPose'u geçici cam ile çağırır
function viaCam(W, x, info, cam) {
  const cur = W.cam; W.cam = { ...cur, ...cam }; let p; try { p = W.cameraPose(x, info); } finally { W.cam = cur; } return p;
}
const shiftPose = (p, off) => ({ ...p, eye: add(p.eye, off), target: add(p.target, off) });
// ağırlık merkezine göre gövde ekseni z boyunca öteleme (ICRF vektörü, km)
const bodyOff = (q, z) => arr(V([0, 0, z * KM]).applyQuaternion(q));

// ---------------------------------------------------------------- düzenekler: her biri (c, p, e) → { eye, target, up, fov }; c: bağlam, p: çekim parametreleri, e: yumuşatılmış τ
const RIG = {
  // araç çevresinde LVLH küresel (az, el, dist km); look: gövde ekseni boyunca bakış noktası ('mid': yığın ortası)
  lvlh(c, p, e) {
    const a = (k) => (Array.isArray(p[k]) ? lerp(p[k][0], p[k][1], e) : p[k]);
    let pose = viaCam(c.W, c.x, c.info, { mode: 'VEHICLE', az: a('az'), el: a('el'), dist: a('dist') });
    if (p.look !== undefined) { const z = p.look === 'mid' ? stackZ(c.W, c.x).mid : p.look; pose = shiftPose(pose, bodyOff(c.q, z)); }
    return { ...pose, fov: a('fov') };
  },
  // gövde çerçevesinde: eye/tgt = [başlangıç, bitiş] (m); ref:'engine' ise z, etkin motor çıkışına göre ölçülür; up: 'local' (dikey) | 'body'
  body(c, p, e) {
    const S = stackZ(c.W, c.x), rz = p.ref === 'engine' ? S.engine : p.ref === 'mid' ? S.mid : 0;
    const lerp3 = (a, b) => [lerp(a[0], b[0], e), lerp(a[1], b[1], e), lerp(a[2], b[2], e)];
    const E3 = lerp3(p.eye[0], p.eye[1]), T3 = lerp3(p.tgt[0], p.tgt[1]);
    const eye = add(c.info.vehPos, arr(V([E3[0] * KM, E3[1] * KM, (E3[2] + rz) * KM]).applyQuaternion(c.q)));
    const target = add(c.info.vehPos, arr(V([T3[0] * KM, T3[1] * KM, (T3[2] + rz) * KM]).applyQuaternion(c.q)));
    const up = p.up === 'body' ? arr(V([0, 1, 0]).applyQuaternion(c.q)) : c.f.up;
    return { eye, target, up, fov: lerp(p.fov[0], p.fov[1], e) };
  },
  // omuz üstü: kamera Dünya/Ay'ın görünen tarafında araçtan "uzakta" durur (araç ön planda, cisim arkada); dist/side/lift metre
  ots(c, p, e) {
    const a = (k) => (Array.isArray(p[k]) ? lerp(p[k][0], p[k][1], e) : p[k]);
    const cen = p.body === 'M' ? c.info.rm : [0, 0, 0], away = unit(sub(c.info.vehPos, cen));
    const vel = sub(c.x.v, p.body === 'M' ? E.moonVel(c.x.t) : [0, 0, 0]);
    let lat = cross(away, unit(vel)); if (norm(lat) < 1e-6) lat = cross(away, [0, 0, 1]); lat = unit(lat);
    const up2 = unit(cross(lat, away));
    const z = p.look === 'mid' ? stackZ(c.W, c.x).mid : 0, tgt = add(c.info.vehPos, bodyOff(c.q, z));
    const eye = add(add(add(tgt, scale(away, a('dist') * KM)), scale(lat, a('side') * KM)), scale(up2, a('lift') * KM));
    return { eye, target: add(tgt, scale(away, -a('aim') * a('dist') * KM)), up: up2, fov: a('fov') };
  },
  // yerden: iniş yerinin yaklaşma eksenli çerçevesinde (x ileri, y yan, h yükseklik; m) sabit gözlemci; araca bakar (fixed: iniş noktasına bakar, tripod: araç kadraja iner), görüş açısı mesafeye göre
  ground(c, p, e) {
    const a = (k) => (Array.isArray(p[k]) ? lerp(p[k][0], p[k][1], e) : p[k]);
    const t = c.x.t, up = unit(siteIcrf(t)), s = add(c.info.rm, siteIcrf(t));
    const ax = c.info.drAxis || unit(cross([0, 0, 1], up)), xx = unit(sub(ax, scale(up, dot(ax, up)))), yy = cross(up, xx);
    const obs = add(s, add(add(scale(xx, a('x') * KM), scale(yy, a('y') * KM)), scale(up, a('h') * KM)));
    const tgt = add(p.fixed ? s : c.info.vehPos, scale(up, (a('aimUp') || 0) * KM)), dM = norm(sub(tgt, obs)) * 1000;
    const fov = clamp(2 * Math.atan(a('frame') / Math.max(5, dM)) * 180 / Math.PI, p.fovMin || 12, p.fovMax || 55);
    return { eye: obs, target: tgt, up, fov };
  },
  // Dünya/Ay/Sistem etrafında geniş: cam = { mode, az, el, dist } (ya da (c, e) → cam); fov
  wide(c, p, e) {
    const cam = typeof p.cam === 'function' ? p.cam(c, e) : Object.fromEntries(Object.entries(p.cam).map(([k, v]) => [k, Array.isArray(v) ? lerp(v[0], v[1], e) : v]));
    const pose = viaCam(c.W, c.x, c.info, cam);
    const tilt = typeof p.tilt === 'function' ? p.tilt(c, e, cam) : Array.isArray(p.tilt) ? lerp(p.tilt[0], p.tilt[1], e) : (p.tilt || 0);
    if (tilt) {                                                       // bakışı yukarı/aşağı yatır (cismin kadrajda alçak durması): kamera sağ ekseni etrafında döndür
      const dir = sub(pose.target, pose.eye), len = norm(dir), r = unit(cross(dir, pose.up)), up = unit(cross(r, dir));
      pose.target = add(pose.eye, scale(add(scale(unit(dir), Math.cos(tilt)), scale(up, Math.sin(tilt))), len));
    }
    return { ...pose, fov: Array.isArray(p.fov) ? lerp(p.fov[0], p.fov[1], e) : p.fov };
  },
};

// Güneş'in aydınlattığı yüz kameraya dönük bakış: göz yönü = Güneş ve araç yönlerinin ağırlıklı toplamı (Dünya merkezli)
export function lightCam(x, dist, wSun, wVeh, dAz = 0, dEl = 0, mode = 'EARTH', cen = [0, 0, 0]) {
  const d = unit(add(scale(unit(sub(E.sunPos(x.t), cen)), wSun), scale(unit(sub(x.r, cen)), wVeh)));
  return { mode, az: Math.atan2(d[1], d[0]) + dAz, el: clamp(Math.asin(clamp(d[2], -1, 1)) + dEl, -1.4, 1.4), dist };
}
// Dünya kıyısı bileşimi: araç görünen diskin kıyısına yakın, Güneş'in aydınlattığı yüz kameraya dönük (açılış çekimi)
export function limbCam(x, dist, theta) {
  const u = unit(x.r), s = unit(E.sunPos(x.t));
  const w = unit(sub(s, scale(u, dot(s, u))));
  const ev = add(scale(u, Math.cos(theta)), scale(w, Math.sin(theta)));
  return { mode: 'EARTH', az: Math.atan2(ev[1], ev[0]), el: Math.asin(clamp(ev[2], -1, 1)), dist };
}

// ---------------------------------------------------------------- çekim listesi (plan olaylarından); P: anahtar → benzetim zamanı (s); durum x: worker durumu
const isBurn = (x) => (x.thr || 0) > 0.01;
export function buildShots(P, opts = {}) {
  const S = [], has = (k) => P[k] != null, tliBurn = opts.tliBurn || 275, loiBurn = opts.loiBurn || 170;
  const add_ = (s) => { S.push(s); return s; };
  const t = (k, o = 0) => P[k] + o;
  const land = opts.landing === 'zem' ? 'ZEM/ZEV güdümü' : 'Yakıt-optimal güdüm';
  // 0 açılış
  add_({ id: 'open', dur: 6.5, wmax: 80, T: () => [[0, P.INS], [1, P.INS + 180]], card: { kind: 'open', at: 0.9, hold: 4.4, title: 'LS19', sub: "Dünya'dan Ay'a · gerçek efemeris · N-cisim fiziği" },
    rig: { type: 'wide', cam: (c, e) => limbCam(c.x, lerp(26000, 19500, e), lerp(1.12, 1.0, e)), tilt: (c, e, cam) => Math.asin(Math.min(0.99, E.R_E / cam.dist)) + 0.11, fov: 42 }, beacon: true, noStrip: true, dip: false });
  // 1 park yörüngesi: geniş zaman atlaması, sonra araca yaklaşma
  if (has('TLI')) {
    add_({ id: 'park-wide', dur: 5.5, wmax: 5000, T: () => [[0, P.INS + 180], [1, Math.max(P.INS + 400, t('TLI', -420))]], chapter: { title: 'PARK YÖRÜNGESİ', sub: (c) => `Dünya çevresinde ${fmt(c.alt, 0)} km irtifada`, at: 0.2, hold: 3.6 },
      rig: { type: 'wide', cam: (c, e) => lightCam(c.x, lerp(17500, 13800, e), 0.85, 0.35, lerp(-0.35, 0.45, e), lerp(0.2, 0.05, e)), fov: 42 }, lines: true, osc: true, beacon: true, dip: true });
    add_({ id: 'park-close', dur: 5.5, wmax: 400, T: () => [[0, t('TLI', -420)], [0.62, t('TLI', -70)], [1, t('TLI', -7)]], rig: { type: 'lvlh', az: [2.35, 3.05], el: [0.24, 0.13], dist: [0.075, 0.048], fov: [34, 30], look: 'mid' }, dip: true });
    // 2 TLI: ateşleme (motor yakın planı) → yakış. Yakış süresi tasarıma bağlı: zaman hızı yakış durumundan (itki, geçen süre) gelir, çekim yakış bitince kapanır
    add_({ id: 'tli-ignite', dur: 7, wmax: 60, T: () => [[0, t('TLI', -7)], [1, t('TLI', 40)]], wf: (x, c) => (c.burnT < 0 ? clamp((P.TLI - x.t) / 2.2, 1, 20) : c.burnT < 2.2 ? 1 : 5), until: (x, c) => c.burnT > 4.2, minT: 3, shake: 0.7,
      chapter: { title: "AY'A TRANSFER YAKIŞI", sub: (c) => `TLI · ${fmt(c.vrel, 2)} km/s'den hızlanıyor`, at: 1.0, hold: 3.8 },
      rig: { type: 'body', ref: 'engine', eye: [[7, -3.5, -17], [12, -2, -24]], tgt: [[0, 0, 4], [0, 0, 2]], fov: [30, 36], up: 'body' } });
    add_({ id: 'tli-burn', dur: 9, wmax: 90, T: () => [[0, t('TLI', 40)], [1, t('TLI', tliBurn)]], wf: (x) => (isBurn(x) ? 28 : 4), until: (x, c) => c.burnT >= 0 && !isBurn(x), minT: 3, shake: 0.5,
      rig: { type: 'lvlh', az: [2.55, 3.55], el: [0.18, 0.34], dist: [0.055, 0.075], fov: [30, 36], look: 'mid' } });
  }
  // 3 kademe ayrılması
  if (has('SEP')) {
    add_({ id: 'sep', dur: 9, wmax: 5000, T: () => [[0, Math.max(t('TLI', tliBurn + 40), P.SEP - 2400)], [0.42, t('SEP', -50)], [0.56, t('SEP', -3)], [1, t('SEP', 32)]],
      chapter: { title: 'KADEME AYRILMASI', sub: 'TLI kademesi atılır', at: 3.6, hold: 3.4 }, flashOnSep: true,
      rigs: [{ to: 0.42, rig: { type: 'ots', body: 'E', dist: [70, 95], side: [34, 22], lift: [14, 18], aim: 0.06, fov: [32, 36], look: 'mid' } },
        { to: 1, rig: { type: 'lvlh', az: [1.15, 1.95], el: [0.1, 0.2], dist: [0.07, 0.095], fov: [34, 38], look: -7 } }] });
    // 4 Ay'a yolculuk
    const tc0 = t('SEP', 32), tcEnd = (has('LOI') ? P.LOI : P.SEP + 300000) - 1200, span = Math.max(4000, tcEnd - tc0), a = Math.min(span * 0.18, 90000), b = Math.min(span * 0.12, 40000);
    add_({ id: 'coast-a', dur: 4.5, wmax: 30000, T: () => [[0, tc0], [1, tc0 + a]], chapter: { title: "AY'A YOLCULUK", sub: (c) => `Dünya'dan ${fmt(c.rE, 0)} km uzakta`, at: 0.3, hold: 3.4 },
      rig: { type: 'ots', body: 'E', dist: [58, 88], side: [30, 42], lift: [10, 15], aim: 0.05, fov: [34, 38], look: 'mid' }, dip: true });
    add_({ id: 'coast-b', dur: 8.5, wmax: 40000, T: () => [[0, tc0 + a], [1, tcEnd - b]], rig: { type: 'wide', cam: { mode: 'SYSTEM', az: [-1.7, -1.0], el: [0.3, 0.2], dist: [1050000, 880000] }, fov: 40, yaw: -0.17 }, lines: true, beacon: true, dip: true });
    add_({ id: 'coast-c', dur: 4.5, wmax: 20000, T: () => [[0, tcEnd - b], [1, tcEnd]], rig: { type: 'wide', cam: (c, e) => ({ mode: 'MOON', az: lerp(0.9, 1.5, e), el: 0.32, dist: lerp(90000, 9000, smooth(e)) }), fov: 40 }, lines: true, beacon: true, dip: false });
  }
  // 5 LOI
  if (has('LOI')) {
    add_({ id: 'loi-approach', dur: 4.5, wmax: 800, T: () => [[0, t('LOI', -1200)], [1, t('LOI', -75)]], rig: { type: 'ots', body: 'M', dist: [80, 70], side: [-36, -28], lift: [10, 6], aim: 0.08, fov: [34, 38], look: 'mid' }, dip: true });
    add_({ id: 'loi-burn', dur: 9, wmax: 90, T: () => [[0, t('LOI', -75)], [1, t('LOI', loiBurn)]], wf: (x, c) => (c.burnT < 0 ? clamp((P.LOI - 60 - x.t) / 2.2, 1.5, 40) : c.burnT < 2.5 ? 1 : 18), until: (x, c) => c.burnT >= 2.5 && !isBurn(x), minT: 3, shake: 0.5,
      chapter: { title: 'AY YÖRÜNGESİNE GİRİŞ', sub: (c) => `LOI · Ay'a göre ${fmt(c.vrel * 1000, 0)} m/s`, at: 0.8, hold: 3.6 },
      rigs: [{ to: 0.3, rig: { type: 'body', ref: 'engine', eye: [[9, -3.5, -12], [11, -2.5, -16]], tgt: [[0, 0, 4], [0, 0, 3]], fov: [32, 36], up: 'body' } },
        { to: 1, rig: { type: 'lvlh', az: [2.6, 3.7], el: [0.2, 0.3], dist: [0.05, 0.07], fov: [32, 36], look: 'mid' } }] });
    // 6 Ay yörüngesi: zaman atlaması
    const tl0 = t('LOI', loiBurn + 40), tl1 = Math.min(has('SEP2') ? P.SEP2 - 110 : has('PDI') ? P.PDI - 400 : tl0 + 12000, tl0 + 18000);       // en çok ~2,7 tur gösterilir; kalanı sonraki çekimin başında kararma altında geçilir
    add_({ id: 'llo', dur: 8, wmax: 2600, T: () => [[0, tl0], [1, Math.max(tl0 + 600, tl1)]], chapter: { title: 'AY YÖRÜNGESİ', sub: (c) => `Ay çevresinde ${fmt(c.alt, 0)} km irtifada`, at: 0.25, hold: 3.4 },
      rig: { type: 'wide', cam: (c, e) => lightCam(c.x, lerp(6400, 4300, e), 0.9, 0.3, lerp(0.95, 0.45, e), lerp(0.32, 0.2, e), 'MOON', E.moonPos(c.x.t)), fov: 42, yaw: [0.34, 0.24] }, lines: true, osc: true, beacon: true, dip: true });   // Güneş'in aydınlattığı yüz (gece yüzü değil); Ay kadrajın sağında (kart solda)
  }
  // 7 iniş kademesinin ayrılması
  if (has('SEP2')) {
    add_({ id: 'sep2', dur: 7.5, wmax: 400, T: () => [[0, t('SEP2', -110)], [0.35, t('SEP2', -6)], [0.45, t('SEP2', 0)], [1, t('SEP2', 70)]], chapter: { title: 'İNİŞ KADEMESİ AYRILIR', sub: 'Ay yörünge kademesi geride kalır', at: 0.9, hold: 3.6 }, flashOnSep: true,
      rig: { type: 'lvlh', az: [1.5, 2.3], el: [0.12, 0.2], dist: [0.05, 0.04], fov: [30, 28], look: 'mid' }, dip: true });
  }
  // 8 motorlu iniş: zaman hızı irtifaya göre (planın tahmini temas anı gerçekten saparken de doğru yavaşlar); çekimler irtifa/evre koşullarıyla biter
  if (has('PDI') && has('INDI')) {
    const alt = (x) => (x.local ? x.local.p[2] : Infinity);
    // irtifa (km) → hedef zaman hızı: log-doğrusal ara değerleme; son metrelerde yavaş çekim
    const LW = [[12, 60], [4, 40], [1.6, 22], [0.6, 12], [0.25, 8], [0.08, 5.5], [0.025, 3.2], [0.008, 1.7], [0, 1.0]];
    const landWarp = (x) => { const a = Math.max(0, alt(x)); if (!Number.isFinite(a) || a > LW[0][0]) return LW[0][1]; for (let i = 0; i < LW.length - 1; i++) { const [a0, w0] = LW[i], [a1, w1] = LW[i + 1]; if (a <= a0 && a >= a1) { const k = (a0 - a) / Math.max(1e-9, a0 - a1); return Math.exp(lerp(Math.log(w0), Math.log(w1), k)); } } return LW[LW.length - 1][1]; };
    add_({ id: 'pdi', dur: 10, wmax: 70, T: () => [[0, t('PDI', -14)], [0.14, t('PDI', 0)], [1, t('PDI', 240)]], wf: (x, c) => (c.burnT < 0 ? clamp((P.PDI + 16 - x.t) / 2.2, 1.5, 40) : c.burnT < 2.4 ? 1.2 : landWarp(x)), until: (x) => alt(x) < 1.3 && x.t > P.PDI + 60, minT: 4, shake: 0.35,
      chapter: { title: 'MOTORLU İNİŞ', sub: land, at: 1.0, hold: 3.6 },
      rigs: [{ to: 0.2, rig: { type: 'body', ref: 'engine', eye: [[6, -2.5, -5], [7, -1.5, -8]], tgt: [[0, 0, 1.5], [0, 0, 1]], fov: [28, 32], up: 'body' } },
        { to: 1, rig: { type: 'lvlh', az: [2.1, 2.45], el: [0.12, 0.08], dist: [0.055, 0.04], fov: [34, 30], look: 'mid' } }], dip: true });
    add_({ id: 'approach', dur: 8, wmax: 40, T: () => [[0, t('PDI', 200)], [1, P.INDI]], wf: landWarp, until: (x) => alt(x) < 0.034, minT: 3, shake: 0.3,
      rig: { type: 'lvlh', az: [2.9, 2.3], el: [0.05, 0.13], dist: [0.04, 0.032], fov: [32, 28], look: 'mid' } });
    add_({ id: 'touchdown', dur: 14, wmin: 0.3, wmax: 20, T: () => [[0, P.INDI - 30], [1, P.INDI + 10]], wf: landWarp,
      until: (x, c) => (x.phase === 'INDI' || x.done) && c.sinceLand > 4.5, minT: 4, shake: 0.25,
      chapter: { title: 'TEMAS', sub: (c) => c.touch, at: 'land', hold: 3.8 },
      rig: { type: 'ground', fixed: true, x: [-40, -34], y: [118, 108], h: [1.7, 1.6], frame: [23, 11], fovMin: 10, fovMax: 46, aimUp: [7.5, 3.2] } });
    add_({ id: 'outro', dur: 13, wmin: 1, wmax: 3, T: () => [[0, P.INDI + 5], [1, P.INDI + 8]], closing: true,
      rig: { type: 'lvlh', az: [-2.5, -1.7], el: [0.1, 0.3], dist: [0.03, 0.075], fov: [34, 30], look: -1.2, yaw: [0.2, 0.26] } });
  }
  return S;
}

const tStart0 = (s, P) => s.T(P)[0][1];
// ---------------------------------------------------------------- yönetmen
export class Cinema {
  // host: { world, send(msg), ui, root (DOM), latest() → son durum, play(on), running() }
  constructor(host) {
    this.h = host; this.on = false; this.state = 'idle'; this.opts = { scale: 1 };
    this.q = new THREE.Quaternion(); this.qInit = false; this.cu = null;
    this.i = -1; this.shot = null; this.shotT = 0; this.wall = 0; this.warpCmd = 1; this.lastSend = 0; this.lastStrip = 0; this.lastDeb = 0; this.paused = false; this.pending = null;
    this.keyHandler = null; this.moveHandler = null; this.activeTimer = 0; this.timer = 0; this.lastStep = 0; this.lastPose = 0; this.dt = 0.016;
  }
  get ui() { return this.cu || (this.cu = new CineUI(this.h.root)); }

  // plan (ui.plan) → anahtar:zaman
  planMap() { const P = {}; for (const p of this.h.ui.plan || []) P[p.key] = p.t; return P; }

  async start(opts = {}) {
    if (this.on || !this.h.latest() || !this.h.ui.plan || !this.h.ui.plan.length) return false;
    this.on = true; this.state = 'boot'; this.opts = { scale: 1, ...opts };
    const W = this.h.world, chk = document.querySelector('#chkAutoWarp');
    this.saved = { cam: { ...W.cam }, autoWarp: chk ? chk.checked : true, running: this.h.running(), warp: (this.h.latest() || {}).warpSet || 1 };
    this.h.onStart && this.h.onStart();
    await W.setCinematic(true, { onLevel: (l) => this.onLevel(l), level: this.opts.quality });
    if (!this.on) { await W.setCinematic(false); return false; }                 // yüklenirken iptal
    const ui = this.ui; ui.enter(); ui.fade(1, 0);
    this.keyHandler = (e) => this.key(e); window.addEventListener('keydown', this.keyHandler, true);
    this.moveHandler = () => { ui.root.classList.add('active'); clearTimeout(this.activeTimer); this.activeTimer = setTimeout(() => ui.root.classList.remove('active'), 2600); };
    window.addEventListener('pointermove', this.moveHandler, { passive: true });
    ui.exitBtn.onclick = () => this.stop();
    // görev baştan: worker 'restarted' dönünce (app.js onRestarted) çekimler başlar
    this.h.send({ cmd: 'autoWarp', on: false });
    this.shots = buildShots(this.planMap(), { landing: this.h.landing && this.h.landing() });
    this.i = -1; this.shot = null; this.paused = false; this.pending = null; this.lastStep = performance.now();
    const total = this.shots.filter((s) => s.chapter).length; this.chTotal = total; let n = 0;
    for (const s of this.shots) if (s.chapter) s.chIdx = ++n;
    ui.ticks(this.tickMarks());
    if (this.opts.preview) { this.state = 'preview'; ui.fade(0, 0); }               // deneme: çekimler elle (preview) gösterilir, görev yeniden kurulmaz
    else { this.h.send({ cmd: 'restart' }); this.restartAt = performance.now(); }
    // denetim, çizimden bağımsız zamanlayıcıyla (kare hızı düşse de zaman hızı ve çekim süreleri gerçek zamanda yürür)
    this.timer = setInterval(() => { const now = performance.now(), dt = Math.min(0.25, (now - this.lastStep) / 1000); this.lastStep = now; this.tick(dt); }, 30);
    return true;
  }
  tickMarks() { const sum = this.shots.reduce((a, s) => a + this.durOf(s), 0); let acc = 0; const out = []; for (const s of this.shots) { if (s.chapter) out.push(acc / sum); acc += this.durOf(s); } return out; }
  durOf(s) { return (s.durEff || s.dur) * this.opts.scale; }

  onRestarted() {
    if (!this.on || this.state !== 'boot') return;
    this.state = 'wait'; this.restartAt = performance.now();
  }

  stop() {
    if (!this.on) return;
    this.on = false; this.state = 'idle'; clearInterval(this.timer); this.timer = 0;
    const W = this.h.world, ui = this.cu;
    window.removeEventListener('keydown', this.keyHandler, true); window.removeEventListener('pointermove', this.moveHandler);
    W.cine.rig = null; W.cine.lines = false; W.cine.osc = false; W.cine.beacon = false;
    Object.assign(W.cam, this.saved.cam);
    this.h.send({ cmd: 'autoWarp', on: this.saved.autoWarp }); this.h.send({ cmd: 'warp', value: this.saved.warp });
    const chk = document.querySelector('#chkAutoWarp'); if (chk) chk.checked = this.saved.autoWarp;
    this.h.play(this.saved.running);
    if (ui) ui.leave();
    W.setCinematic(false);
    this.h.onStop && this.h.onStop();
  }

  onLevel(l) { if (this.cu && l !== 'high') this.cu.card({ kind: 'chapter', title: 'KALİTE DÜŞTÜ', sub: l === 'medium' ? 'Orta: çizgi parlama ve MSAA kapalı' : 'Düşük: son işlem kapalı', hold: 2.4 }); }

  key(e) {
    const k = e.key.toLowerCase();
    if (k === 'escape') { e.preventDefault(); e.stopPropagation(); this.stop(); return; }
    if (k === ' ') { e.preventDefault(); e.stopPropagation(); this.setPaused(!this.paused); return; }
    if (k === 'arrowright') { e.preventDefault(); e.stopPropagation(); this.skip(); return; }
    if (k === 'r' && (this.state === 'ended' || this.state === 'run')) { e.preventDefault(); e.stopPropagation(); this.restart(); return; }
    e.stopPropagation();                                                          // sinematik kipte diğer kısayollar kapalı
  }
  setPaused(on) {
    this.paused = on; this.h.play(!on); this.ui.paused = on;
    const hint = this.ui.f.hint; hint.innerHTML = on ? '<kbd>Boşluk</kbd> devam · <kbd>Esc</kbd> çık' : '<kbd>Esc</kbd> çık · <kbd>Boşluk</kbd> duraklat · <kbd>→</kbd> sonraki çekim'; hint.classList.toggle('show', on);
    if (!on) this.ui.showHint(false);
  }
  skip() { if (this.shot && !this.shot.closing) this.endShot(true); }
  async restart() { const o = this.opts; this.ui.leave(true); this.on = false; this.state = 'idle'; clearInterval(this.timer); this.timer = 0; window.removeEventListener('keydown', this.keyHandler, true); window.removeEventListener('pointermove', this.moveHandler); this.h.world.cine.rig = null; await this.h.world.setCinematic(false); await this.start(o); }

  // ----- çekim yaşam döngüsü
  // çekimi kur (zaman eğrisi, kamera, bayraklar); atlama mantığı startShot'ta
  beginShot(i, tau0 = 0) {
    const P = this.planMap(), W = this.h.world, s = this.shots[i], x = this.h.latest();
    this.i = i; this.shot = s; this.shotT = tau0 * this.durOf(s); this.cardDone = false; this.landT = null; this.burnStart = null; this.sepSeen = (x.debris || []).length; this.qInit = false;
    const T = s.T(P); s.keys = T; s.f = pchip(T.map((k) => k[0]), T.map((k) => k[1])); s.tEnd = T[T.length - 1][1]; s.tStart = T[0][1];
    // süre: istenen zaman hızı sınırını aşmasın (aşıyorsa uzar)
    const span = Math.max(0, s.tEnd - s.tStart); s.durEff = Math.max(s.dur, span / ((s.wmax || 20000) * 0.85));
    W.cam.auto = false; W.cam.mode = 'CINE'; W.cine.rig = (xx, info, ww) => this.pose(xx, info, ww);
    W.cine.lines = !!s.lines; W.cine.osc = !!s.osc; W.cine.beacon = !!s.beacon;
    const ui = this.ui; ui.root.classList.toggle('nostrip', !!s.noStrip);
    ui.progress(this.progressAt(i, tau0));
  }
  startShot(i) {
    const s = this.shots[i];
    if (!s) { this.finish(); return; }
    const x = this.h.latest(), P = this.planMap(), T = s.T(P), tEnd = T[T.length - 1][1];
    if (x.t >= tEnd - 0.5 && !s.closing && !s.wf) { this.i = i; this.endShot(false); return; }               // sim zaten geçmiş: çekim atlanır
    // sim planlanan başlangıcın gerisindeyse (hesap duraklaması vb.): kararma altında hızla ilerletilir, sonra çekim başlar
    if (!s.wf && tStart0(s, P) - x.t > 4) { this.catchUp = { i, tStart: tStart0(s, P), t0: this.wall }; this.state = 'catch'; this.ui.fade(1, 260); return; }
    this.beginShot(i);
    const ui = this.ui;
    if (s.dip) ui.fade(0, 520); else if (this.state === 'wait') ui.fade(0, 900);
    this.state = 'run'; this.warpCmd = Math.max(1, Math.min(this.warpCmd, 2));
  }
  startShotNoCatch(i) { this.beginShot(i); const s = this.shots[i]; if (s.dip || true) this.ui.fade(0, 520); this.state = 'run'; }
  // deneme: çekimi τ anında göster (sim o ana atlanır ve durur); beginShot + kart/şerit hemen
  async preview(id, tau = 0.5, tOverride = null) {
    if (!this.on) await this.start({ preview: true, quality: this.opts.quality });
    const i = this.shots.findIndex((q) => q.id === id), s = this.shots[i]; if (!s) return false;
    const P = this.planMap(), T = s.T(P), f = pchip(T.map((k) => k[0]), T.map((k) => k[1])), tSim = tOverride != null ? tOverride : f(tau)[0];
    this.h.send({ cmd: 'seek', t: tSim });
    const t0 = performance.now();
    while (performance.now() - t0 < 40000) { await new Promise((r) => setTimeout(r, 200)); const x = this.h.latest(); if (x && Math.abs(x.t - tSim) < 3) break; }
    this.h.play(false); this.paused = true; this.state = 'preview';
    this.beginShot(i, tau); this.ui.fade(0, 0);
    const x = this.h.latest(), ui = this.ui; ui.cards.textContent = '';
    if (s.chapter) { const c = this.ctxText(x), ch = s.chapter; ui.card({ kind: 'chapter', idx: s.chIdx, total: this.chTotal, title: ch.title, sub: typeof ch.sub === 'function' ? ch.sub(c) : ch.sub, hold: 0 }); }
    if (s.card) ui.card({ kind: s.card.kind, title: s.card.title, sub: s.card.sub, hold: 0 });
    if (s.closing) this.closingCard(x);
    this.lastStrip = 0; this.strip(x); ui.progress(this.progressAt(i, tau));
    return true;
  }
  endShot(manual) {
    const nxt = this.i + 1, s = this.shots[nxt];
    if (!s) { this.finish(); return; }
    if (s.dip && !this.pending) { this.ui.fade(1, 280); this.pending = { i: nxt, at: this.wall + 0.3 }; } else this.startShot(nxt);
  }
  finish() {
    this.state = 'ended'; this.ui.fade(0, 0);
    const hint = this.ui.f.hint; hint.innerHTML = '<kbd>R</kbd> yeniden izle · <kbd>Esc</kbd> çık'; hint.classList.add('show');
  }

  progressAt(i, tau) {
    let sum = 0, acc = 0; for (let k = 0; k < this.shots.length; k++) { const d = this.durOf(this.shots[k]); if (k < i) acc += d; sum += d; }
    return (acc + tau * this.durOf(this.shots[i])) / Math.max(1, sum);
  }

  // kamera pozu (scene.cameraPose → CINE kipi)
  pose(x, info, W) {
    const s = this.shot; if (!s) return null;
    const dur = this.durOf(s), tau = clamp(this.shotT / Math.max(0.1, dur), 0, 1), e = smooth(tau);
    // yumuşatılmış yönelim (RCS/yönelim titremesi kamerayı sallamasın)
    const nowP = performance.now(), dtf = Math.min(0.1, (nowP - this.lastPose) / 1000 || 0.016); this.lastPose = nowP;
    if (W.attQ) { if (!this.qInit) { this.q.copy(W.attQ); this.qInit = true; } else this.q.slerp(W.attQ, 1 - Math.exp(-dtf / 0.35)); }
    const up = unit(sub(info.vehPos, info.central === 'M' ? info.rm : [0, 0, 0]));
    const c = { W, x, info, q: this.q, f: { up }, alt: this.alt(x, info), rE: norm(x.r) };
    let r = s.rig; if (s.rigs) { r = s.rigs[s.rigs.length - 1].rig; for (const q of s.rigs) { if (tau <= q.to) { r = q.rig; break; } } }
    const local = r.type === 'lvlh' || r.type === 'body' || r.type === 'ground' || r.type === 'ots' ? tau : tau;
    let k = e; if (s.rigs) { let lo = 0; for (const q of s.rigs) { if (tau <= q.to) { k = smooth((tau - lo) / Math.max(1e-6, q.to - lo)); break; } lo = q.to; } }
    const pose = RIG[r.type](c, r, k);
    const yaw = Array.isArray(r.yaw) ? lerp(r.yaw[0], r.yaw[1], k) : (r.yaw || 0);
    if (yaw) {                                                                       // bakışı dikey eksen etrafında döndür: özneyi kadrajın bir yanına kaydırır (bindirme metni için yer)
      const d = sub(pose.target, pose.eye), u = unit(pose.up), co = Math.cos(yaw), si = Math.sin(yaw), cr = cross(u, d), dd = dot(u, d);
      pose.target = add(pose.eye, add(add(scale(d, co), scale(cr, si)), scale(u, dd * (1 - co))));
    }
    // el kamerası titreşimi: yakış sırasında hafif (tek sinüs toplamı)
    const sh = (s.shake || 0) * (isBurn(x) ? 1 : 0.2) * (this.reduced ? 0 : 1);
    if (sh > 0) {
      const t = this.wall, n1 = Math.sin(t * 7.3) + 0.6 * Math.sin(t * 13.9 + 1.7), n2 = Math.sin(t * 6.1 + 0.5) + 0.6 * Math.sin(t * 15.3 + 2.3);
      const dir = sub(pose.target, pose.eye), len = norm(dir), r1 = unit(cross(dir, pose.up)), u1 = unit(cross(r1, dir));
      pose.target = add(pose.eye, add(dir, add(scale(r1, len * 0.0016 * sh * n1), scale(u1, len * 0.0016 * sh * n2))));
    }
    return pose;
  }
  alt(x, info) {
    const rE = norm(x.r), rs = norm(sub(x.r, E.moonPos(x.t))), nearM = rs < E.MOON_ZONE, sphi = x.r[2] / rE, Rell = E.R_E * (1 - (1 / 298.257) * sphi * sphi);
    return nearM ? (x.local ? x.local.p[2] : rs - E.R_M) : rE - Rell;
  }

  // ----- her kare (app.js, world.update'ten önce)
  tick(dt) {
    if (!this.on) return;
    const x = this.h.latest(); if (!x) return;
    this.reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.dt = dt;
    const ui = this.ui;
    if (this.state === 'boot' || this.state === 'preview') return;
    if (this.state === 'catch') {
      const c = this.catchUp, behind = c.tStart - x.t;
      if (behind <= 0.8 || this.wall - c.t0 > 30) { this.state = 'run'; this.warpCmd = 1; this.h.send({ cmd: 'warp', value: 1 }); this.startShotNoCatch(c.i); }
      else { const w = clamp(behind / 0.9, 1, 40000); this.warpCmd = w; if (performance.now() - this.lastSend > 60) { this.lastSend = performance.now(); this.h.send({ cmd: 'warp', value: w }); } this.wall += dt; }
      return;
    }
    if (this.state === 'wait') {
      // yeni görev kuruldu ve ilk durum geldi mi (t ≈ INS)
      const P = this.planMap();
      if (performance.now() - this.restartAt > 250 && Math.abs(x.t - P.INS) < 400) { this.h.send({ cmd: 'warp', value: 1 }); this.h.play(true); this.wall = 0; this.startShot(0); }
      return;
    }
    if (this.paused) { this.dt = 0; }
    else this.wall += dt;
    if (this.pending && this.wall >= this.pending.at) { const n = this.pending.i; this.pending = null; this.startShot(n); }
    const s = this.shot; if (!s) return;
    if (this.state === 'ended') { this.strip(x); return; }
    if (!this.paused) this.shotT += dt;
    const dur = this.durOf(s), tau = clamp(this.shotT / dur, 0, 1);
    // zaman hızı: ileri besleme (eğri türevi) + hata düzeltmesi; yakışta üst sınır
    const [Tn, dT] = s.f(tau), ff = (dT / dur) * (1 / this.opts.scale);
    const err = Tn - x.t, wBurn = isBurn(x) ? 90 : Infinity;
    if (isBurn(x)) { if (this.burnStart == null) this.burnStart = this.shotT; } else if (this.burnStart != null && this.shotT - this.burnStart > 0.5 && !s.keepBurn) { /* yakış bitti: burnT korunur (until bunu görür) */ }
    const cx = { tau, shotT: this.shotT, burnT: this.burnStart != null ? this.shotT - this.burnStart : -1, sinceLand: this.landT != null ? this.shotT - this.landT : -1 };
    let w = s.wf ? s.wf(x, cx) : ff + err / 0.8;
    if (this.pending) w = 1;                                                        // kararma bekleyen çekim sonunda sim olayı geçmesin
    // yaklaşma sınırlayıcı: zaman hedefli çekimlerde kalan benzetim süresi / 0.45 s'den hızlı gidilmez (worker→ana iş parçacığı gecikmesi yüzünden hedef aşılmasın)
    if (!s.wf && !s.until) w = Math.min(w, Math.max(s.wmin ?? 1, (s.tEnd - x.t) / 0.45));
    w = clamp(w, s.wmin ?? 1, Math.min(s.wmax || 20000, wBurn));
    if (x.phase === 'INDI' || x.done) { if (this.landT == null) this.landT = this.shotT; } else this.landT = null;
    if (this.paused) w = 1;
    // artışta yumuşak, azalışta anında (olayı geçmesin)
    this.warpCmd = w > this.warpCmd ? this.warpCmd + (w - this.warpCmd) * (1 - Math.exp(-dt / 0.35)) : w;
    if (performance.now() - this.lastSend > 60 && Math.abs(this.warpCmd - (this.lastWarp || 0)) > Math.max(0.02, 0.02 * this.warpCmd)) { this.lastSend = performance.now(); this.lastWarp = this.warpCmd; this.h.send({ cmd: 'warp', value: this.warpCmd }); }
    // olaylar: ayrılma parlaması
    const nd = (x.debris || []).length; if (nd > this.sepSeen) { if (s.flashOnSep && !this.reduced) ui.flash(); this.sepSeen = nd; }
    // kartlar
    const atT = s.chapter && (s.chapter.at === 'land' ? (this.landT != null ? this.shotT - this.landT >= 0.2 : false) : this.shotT >= s.chapter.at);
    if (!this.cardDone && s.chapter && atT) {
      this.cardDone = true; const c = this.ctxText(x), ch = s.chapter;
      ui.card({ kind: 'chapter', idx: s.chIdx, total: this.chTotal, title: ch.title, sub: typeof ch.sub === 'function' ? ch.sub(c) : ch.sub, hold: ch.hold });
    }
    if (!this.cardDone && s.card && this.shotT >= s.card.at) { this.cardDone = true; ui.card({ kind: s.card.kind, title: s.card.title, sub: s.card.sub, hold: s.card.hold }); }
    if (s.closing && !this.cardDone && this.shotT >= 3.2) { this.cardDone = true; this.closingCard(x); }
    // veri şeridi (8 Hz) ve ilerleme
    this.strip(x); ui.progress(this.progressAt(this.i, tau));
    // çekim sonu: sim hedefine vardı mı / erken bitiş koşulu / zaman aşımı
    if (!this.pending && !s.closing) {
      const early = s.until && this.shotT >= (s.minT || 1) * this.opts.scale && s.until(x, cx);
      const reached = s.wf ? this.shotT >= dur * 3 : tau >= 1 && (x.t >= s.tEnd - Math.max(2, 0.012 * (s.tEnd - s.tStart), 0.3 * (this.warpCmd || 1)) || this.shotT >= dur * 2.2);
      if (early || reached) this.endShot(false);
    }
    if (s.closing && this.shotT >= dur) this.finish();
  }

  // başlık ve alt yazılar için bağlam
  ctxText(x) {
    const rm = E.moonPos(x.t), rs = sub(x.r, rm), vrel = norm(sub(x.v, E.moonVel(x.t)));
    const r = x.result, touch = r && r.v_mps ? `dikey ${fmt(Math.abs(r.v_mps[2]), 2)} m/s · yatay ${fmt(Math.hypot(r.v_mps[0], r.v_mps[1]), 2)} m/s` : 'iniş tamamlandı';
    const st = (this.h.ui.design && this.h.ui.design.STAGES && this.h.ui.design.STAGES[0] && this.h.ui.design.STAGES[0].name) || 'TLI kademesi';
    return { alt: this.alt(x), rE: norm(x.r), rM: norm(rs), vrel, touch, stage: st };
  }

  strip(x) {
    const now = performance.now(); if (now - this.lastStrip < 120) return; this.lastStrip = now;
    const ui = this.ui, rE = norm(x.r), rm = E.moonPos(x.t), rsv = sub(x.r, rm), rs = norm(rsv), nearM = rs < E.MOON_ZONE, met = x.t - (this.h.ui.tLaunch || 0);
    let alt = this.alt(x); if (Math.abs(alt) < 5e-5) alt = 0;
    const vRel = nearM ? (x.local && x.local.p[2] < 50 ? norm(x.local.v) : norm(sub(x.v, E.moonVel(x.t)))) : norm(x.v);
    const fa = (a) => (a > 100 ? fmt(a, 0) + ' km' : a > 2 ? fmt(a, 2) + ' km' : fmt(a * 1000, 1) + ' m'), fv = (v) => (v > 0.1 ? fmt(v, 3) + ' km/s' : fmt(v * 1000, 1) + ' m/s');
    let k1 = 'İrtifa', v1 = fa(alt), k2 = 'Hız', v2 = fv(vRel);
    if (!nearM && rE > 60000) { k1 = "Dünya'ya"; v1 = fa(rE); k2 = "Ay'a"; v2 = fa(rs); }
    else if (x.local && x.local.p[2] < 20) { const up = unit(rsv), vs = sub(x.v, E.moonVel(x.t)), vr = sub(vs, cross(E.omegaMoon(x.t), rsv)); k2 = 'Dikey hız'; v2 = fmt(Math.abs(dot(vr, up)) * 1000, 1) + ' m/s'; }
    if (x.phase === 'INDI' && x.result && x.result.v_mps) { k2 = 'Temas hızı'; v2 = fmt(Math.abs(x.result.v_mps[2]), 2) + ' m/s'; }
    const w = x.warp || 1;
    ui.strip({ met: 'T+' + fmtDur(met), phase: this.h.ui.phaseLabel ? this.h.ui.phaseLabel(x.phase) : x.phase, chap: this.state === 'ended' ? 'Gösterim bitti' : 'Aşama', k1, v1, k2, v2, warp: '×' + (w >= 100 ? fmt(w, 0) : fmt(w, w < 10 ? 1 : 0)) });
  }

  closingCard(x) {
    const ui = this.ui, r = x.result || {}, ok = r.ok !== false;
    (async () => {
      const dvUsed = (x.dv || 0) * 1000, mass = x.m || 0, met = x.t - (this.h.ui.tLaunch || 0);
      const stats = await ui.summary([
        { label: 'Görev süresi', text: 'T+' + fmtDur(met) },
        { label: 'Kullanılan Δv', value: dvUsed, unit: 'm/s', format: { maximumFractionDigits: 0 } },
        { label: 'Temas: dikey', value: r.v_mps ? Math.abs(r.v_mps[2]) : 0, unit: 'm/s', format: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
        { label: 'Kalan yakıt', value: r.prop != null ? r.prop : (x.prop || 0), unit: 'kg', format: { maximumFractionDigits: 0 } }]);
      const d = ui.card({ kind: 'close', title: ok ? 'İNİŞ BAŞARILI' : 'GÖREV SONA ERDİ', sub: 'LS19 · Look Star 19', extra: '' });
      ui.root.classList.add('nostrip');                                               // özet kartı aynı değerleri gösterir: veri şeridi söner (zaman çizelgesi kalır)
      d.appendChild(stats.box); setTimeout(() => stats.run(), 1100);
    })();
  }
}
