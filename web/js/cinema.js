// LS19 sinematik "fragman" yönetmeni: görevi baştan oynatır, çekim listesine göre kamerayı ve zaman hızını yönetir, bölüm kartlarını gösterir.
//   · Çekimler görev planındaki olaylara (INS, TLI, SEP, MCC, LOI, DOI, SEP2, PDI, INDI) bağlıdır; her çekimin gerçek süresi (dur) ve "gerçek süre → benzetim zamanı" eğrisi (T) vardır.
//   · Zaman hızı kapalı çevrim: istenen benzetim zamanı eğrisinden ileri besleme + hata düzeltmesi (fizik worker'ına 'warp' komutu); yakış sırasında sınır, böylece yakışlar atlanmaz.
//   · Kamera düzenekleri: LVLH (araç çevresi), gövde çerçevesi (motor yakın planı), omuz üstü (Dünya/Ay arkada), iniş yeri (yerden), geniş (Dünya/Ay/Sistem). scene.js 'CINE' kipi bunları çağırır.
//   · Bindirmeler cinemaui.js + css/cinema.css; son işlem (bloom, film) scene.js setCinematic → post.js.
import * as THREE from 'three';
import * as E from './engine.js';
import { VIEW } from './moonsite.js';
import { ellipsoidAlt } from './geo.js';
import { LANDING_PHASES as POWERED } from './telemetry.js';
import { CineUI } from './cinemaui.js';
import { fmtDur } from './format.js';
import { rocketOf } from './rockets.js';
import { CineAudio } from './cineaudio.js';
import { LOC, translateText, isEn } from './i18n.js';

const { add, sub, scale, dot, cross, norm, unit } = E;
const KM = 0.001;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => { k = clamp(k, 0, 1); return k * k * k * (k * (k * 6 - 15) + 10); };
const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString(LOC, { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
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
    const t = c.x.t, up = unit(VIEW.site.icrf(t)), s = add(c.info.rm, VIEW.site.icrf(t));
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

// ---------------------------------------------------------------- kalkış açılışı (ascentplay.js sessiz kipte oynar; hız buradan)
// Kalkış zaman hızı (gerçek uçuş saniyesine göre): geri sayım ve kalkış (kule, ilk saniyeler) gerçek zamanda; her ayrılmanın (kademe, yan/katı itici, burun
// kaportası, kaçış kulesi: araç üstü kameradan görünür) çevresi yavaş; aralar ×24, son ayrılmadan sonra ×50. Geçişler uzaklığa göre doğrusal rampadır:
// pencereye d uçuş saniyesi kala hız ≈ yavaş + 2·d (ekranda ~1–2 s).
export const ASC = { FROM: -6, LIFT: 10, SLOW: 1.6, PRE: 2, POST: 4, MID: 24, LATE: 50, RAMP: 2 };
export function ascentWarp(real, events, tIns) {
  const seps = (events || []).filter((e) => (e.cut != null || e.part) && e.t > ASC.LIFT && e.t < tIns).map((e) => e.t);
  const lastSep = seps.length ? Math.max(...seps) : ASC.LIFT;
  let w = real >= lastSep + ASC.POST ? ASC.LATE : ASC.MID;
  w = Math.min(w, 1 + ASC.RAMP * Math.max(0, real - ASC.LIFT));                      // kalkıştan sonra yavaşça hızlan
  for (const t of seps) {                                                           // ayrılma penceresi [t − PRE, t + POST]
    const d = real < t - ASC.PRE ? t - ASC.PRE - real : real > t + ASC.POST ? real - t - ASC.POST : 0;
    w = Math.min(w, ASC.SLOW + ASC.RAMP * d);
  }
  return Math.max(1, Math.min(ASC.LATE, w));
}
// kalkış açılışının ekran süresi (s): hız çizelgesinin tersinin tümlevi, from → to (uçuş s; varsayılan yörüngeye giriş)
export function ascentDuration(events, tIns, from = ASC.FROM, to = tIns) {
  let sum = 0; for (let r = from; r < Math.min(to, tIns); r += 0.25) sum += Math.min(0.25, Math.min(to, tIns) - r) / ascentWarp(r + 0.125, events, tIns);
  return sum;
}

// ---------------------------------------------------------------- olay alt yazıları: görev olayları (mission.js log) ve gösterim olayları (groundnet.js)
// cueOf(e) → { text, pri } | null. pri: 3 yakış, ayrılma, Ay'ın arkası, ağ devri; 1 gölge, pasifleştirme. İstasyon devri ve kısa LOS/AOS gösterilmez (sık ve önemsiz).
const num = (m, re) => { const r = re.exec(m || ''); return r ? r.slice(1).map(Number) : null; };
const NET_TXT = { NSN: 'Yakın Uzay Ağı', DSN: 'Derin Uzay Ağı', TDRS: 'TDRS' };
export function cueOf(e) {
  const k = e.key || '', m = e.msg || '';
  if (k === 'SEP-SPRING') { const d = num(m, /yaylar ([\d.]+) m\/s/); return { text: d ? `Kelepçe bandı açıldı · yaylar ${fmt(d[0], 1)} m/s` : 'Kelepçe bandı açıldı', pri: 3 }; }
  if (k === 'SEP-TURN') return { text: 'Kademe CCAM yönelimine dönüyor', pri: 3 };
  if (k === 'SEP-CCAM') return { text: 'CCAM · kademe hidrazin iticileriyle uzaklaşıyor', pri: 3 };
  if (k === 'SEP-CCAM_END') { const d = num(m, /uzaklık ([\d.]+) m/); return { text: d ? `CCAM tamam · iniş aracına ${fmt(d[0], 0)} m` : 'CCAM tamam', pri: 3 }; }
  if (k === 'SEP-BD') return { text: 'Kademe kalan yakıtını boşaltıyor', pri: 3 };
  if (k === 'SEP-EOM') return { text: 'TLI kademesi pasifleştirildi', pri: 1 };
  if (/^MCC-\d$/.test(k)) return { text: `${k} · rota düzeltmesi Δv ${fmt(e.dvm ?? 0, 2)} m/s`, pri: 3 };
  if (/^TCM-\d$/.test(k)) return { text: `${k} · rota düzeltmesi Δv ${fmt(e.dvm ?? 0, 2)} m/s`, pri: 3 };
  if (k === 'LOI-1_END') { const p = num(m, /periselen ([\d.]+) km, aposelen ([\d.]+) km/); return { text: p ? `LOI-1 tamam · ${fmt(p[0], 1)} × ${fmt(p[1], 1)} km` : 'LOI-1 tamam', pri: 3 }; }
  if (k === 'LOI-2') return { text: `LOI-2 · daireselleştirme Δv ${fmt(e.dvm ?? 0, 2)} m/s`, pri: 3 };
  if (k === 'LOI_END') { const p = num(m, /periselen ([\d.]+) km, aposelen ([\d.]+) km/); return { text: p ? `Ay yörüngesi · ${fmt(p[0], 1)} × ${fmt(p[1], 1)} km` : 'Ay yörüngesinde', pri: 3 }; }
  if (k === 'DOI') return { text: 'DOI · alçalma yörüngesine geçiş', pri: 3 };
  if (k === 'DOI_END') { const p = num(m, /periselen ([\d.]+) km/); return { text: p ? `DOI tamam · periselen ${fmt(p[0], 1)} km` : 'DOI tamam', pri: 3 }; }
  // LOS/AOS: yalnız Ay'ın arkası ve uzun sessizlik (yolculukta istasyonlar arası kısa boşluklar ×10⁴ hızda gürültüdür)
  if (k === 'LOS') return e.cause === 'moon' ? { text: "LOS · Ay'ın arkasında, Dünya ile bağlantı yok", pri: 3 } : null;
  if (k === 'AOS') return e.dur != null && e.dur >= 300 ? { text: `AOS · bağlantı yeniden kuruldu (${fmt(e.dur / 60, 0)} dk sessizlik)`, pri: 3 } : null;
  if (k === 'NET') return { text: `Ağ devri · ${NET_TXT.NSN} → ${NET_TXT[e.net] || e.net}`, pri: 3 };
  // motorlu iniş ve son metreler (Apollo 11 çağrıları gibi)
  if (k === 'CALL') { const c = num(m, /^(\d+) m: alçalış ([\d.]+) m\/s/); return c ? { text: `${fmt(c[0], 0)} m · alçalış ${fmt(c[1], 1)} m/s`, pri: 2 } : null; }
  if (k === 'GATE') { const c = num(m, /irtifa (\d+) m/); return { text: c ? `Son iniş kapısı · ${fmt(c[0], 0)} m` : 'Son iniş kapısı', pri: 2 }; }
  if (k === 'LOW_FUEL') return { text: 'Düşük yakıt · %5', pri: 3 };
  if (k === 'FUEL') { const c = num(m, /(\d+) s/); return c ? { text: `Yakıt · askıda kalmaya ${fmt(c[0], 0)} s`, pri: 3 } : null; }
  if (k === 'DUST') { const c = num(m, /yüzeyden (\d+) m/); return { text: c ? `Toz kalkıyor · motor çıkışı ${fmt(c[0], 0)} m yukarıda` : 'Toz kalkıyor', pri: 2 }; }
  if (k === 'CONTACT') return { text: 'Temas ışığı · sonda yüzeye değdi', pri: 3 };
  if (k === 'ENGINE_STOP') return { text: 'Motor durduruldu · araç ayaklarına oturuyor', pri: 3 };
  if (k === 'TOUCH_ENV') { const c = num(m, /eğim ([\d.]+)°/); return { text: c ? `Temas zarfı içinde · eğim ${fmt(c[0], 1)}°` : 'Temas zarfı', pri: 1 }; }
  // yüzey evresi (touchdown.js POST_LANDING; Apollo 11 zamanları)
  if (k === 'ENGINE_SAFE') return { text: 'Motor emniyete alındı', pri: 3 };
  if (k === 'TILT') { const c = num(m, /dikeyden ([\d.]+)°/); return { text: c ? `Yüzeyde duruş · dikeyden ${fmt(c[0], 1)}° eğik` : 'Yüzeyde duruş raporu', pri: 3 }; }
  if (k === 'DPS_VENT') return { text: 'İniş kademesi tankları tahliye ediliyor', pri: 3 };
  if (k === 'STAY_T1') return { text: 'Yüzeyde kalış kararı (T1): KAL', pri: 3 };
  if (k === 'ECL_IN') return { text: e.by === 'Ay' ? "Ay'ın gölgesine giriş" : "Dünya'nın gölgesine giriş", pri: 1 };
  if (k === 'ECL_OUT') return { text: e.by === 'Ay' ? "Ay'ın gölgesinden çıkış" : "Dünya'nın gölgesinden çıkış", pri: 1 };
  return null;
}

// ---------------------------------------------------------------- çekim listesi (plan olaylarından); P: anahtar → benzetim zamanı (s); durum x: worker durumu
const isBurn = (x) => (x.thr || 0) > 0.01;
export function buildShots(P, opts = {}) {
  const S = [], has = (k) => P[k] != null, tliBurn = opts.tliBurn || 275, loiBurn = opts.loiBurn || 170;
  const add_ = (s) => { S.push(s); return s; };
  const t = (k, o = 0) => P[k] + o;
  const land = opts.landing === 'zem' ? 'ZEM/ZEV güdümü' : 'Yakıt-optimal güdüm';
  // 0 açılış
  // kalkış açılışı oynandıysa (opts.ascent) LS19 kartı kalkışta gösterilmiştir: açılış çekimi yörüngeye girişin bölüm kartını taşır
  const openCard = opts.ascent ? { chapter: { short: 'Yörünge', title: 'YÖRÜNGEDE', sub: (c) => `Park yörüngesi · ${fmt(c.alt, 0)} km · ${fmt(norm(c.x.v), 2)} km/s`, at: 0.8, hold: 3.8 } }
    : { card: { kind: 'open', at: 0.9, hold: 4.4, title: 'LS19', sub: "Dünya'dan Ay'a · gerçek efemeris · N-cisim fiziği" } };
  add_({ id: 'open', dur: 6.5, wmax: 80, T: () => [[0, P.INS], [1, P.INS + 180]], ...openCard,
    rig: { type: 'wide', cam: (c, e) => limbCam(c.x, lerp(26000, 19500, e), lerp(1.12, 1.0, e)), tilt: (c, e, cam) => Math.asin(Math.min(0.99, E.R_E / cam.dist)) + 0.11, fov: 42 }, beacon: true, noStrip: true, dip: false });
  // 1 park yörüngesi: geniş zaman atlaması, sonra araca yaklaşma
  if (has('TLI')) {
    add_({ id: 'park-wide', dur: 5.5, wmax: 5000, T: () => [[0, P.INS + 180], [1, Math.max(P.INS + 400, t('TLI', -420))]], chapter: { short: 'Park', title: 'PARK YÖRÜNGESİ', sub: (c) => `Dünya çevresinde ${fmt(c.alt, 0)} km irtifada`, at: 0.2, hold: 3.6 },
      rig: { type: 'wide', cam: (c, e) => lightCam(c.x, lerp(17500, 13800, e), 0.85, 0.35, lerp(-0.35, 0.45, e), lerp(0.2, 0.05, e)), fov: 42 }, lines: true, osc: true, beacon: true, dip: true });
    add_({ id: 'park-close', dur: 5.5, wmax: 400, T: () => [[0, t('TLI', -420)], [0.62, t('TLI', -70)], [1, t('TLI', -7)]], rig: { type: 'lvlh', az: [2.35, 3.05], el: [0.24, 0.13], dist: [0.075, 0.048], fov: [34, 30], look: 'mid' }, dip: true });
    // 2 TLI: ateşleme (motor yakın planı) → yakış. Yakış süresi tasarıma bağlı: zaman hızı yakış durumundan (itki, geçen süre) gelir, çekim yakış bitince kapanır
    add_({ id: 'tli-ignite', dur: 7, wmax: 60, T: () => [[0, t('TLI', -7)], [1, t('TLI', 40)]], wf: (x, c) => (c.burnT < 0 ? clamp((P.TLI - x.t) / 2.2, 1, 20) : c.burnT < 2.2 ? 1 : 5), until: (x, c) => c.burnT > 4.2, minT: 3, shake: 0.7,
      chapter: { short: 'TLI', title: "AY'A TRANSFER YAKIŞI", sub: (c) => `TLI · ${fmt(c.vrel, 2)} km/s'den hızlanıyor`, at: 1.0, hold: 3.8 },
      rig: { type: 'body', ref: 'engine', eye: [[7, -3.5, -17], [12, -2, -24]], tgt: [[0, 0, 4], [0, 0, 2]], fov: [30, 36], up: 'body' } });
    add_({ id: 'tli-burn', dur: 9, wmax: 90, T: () => [[0, t('TLI', 40)], [1, t('TLI', tliBurn)]], wf: (x) => (isBurn(x) ? 28 : 4), until: (x, c) => c.burnT >= 0 && !isBurn(x), minT: 3, shake: 0.5,
      rig: { type: 'lvlh', az: [2.55, 3.55], el: [0.18, 0.34], dist: [0.055, 0.075], fov: [30, 36], look: 'mid' } });
  }
  // 3 kademe ayrılması
  if (has('SEP')) {
    // ayrılma, sonra kademenin CCAM'i (SEP + 100…370 s: dönüş, hidrazin itişi; alt yazılar) — kamera geri çekilir, iniş aracı ve uzaklaşan kademe birlikte
    add_({ id: 'sep', dur: 12, wmax: 5000, T: () => [[0, Math.max(t('TLI', tliBurn + 40), P.SEP - 2400)], [0.32, t('SEP', -50)], [0.43, t('SEP', -3)], [0.68, t('SEP', 32)], [1, t('SEP', 400)]],
      chapter: { short: 'Ayrılma', title: 'KADEME AYRILMASI', sub: 'TLI kademesi atılır', at: 4.6, hold: 3.4 }, flashOnSep: true,
      rigs: [{ to: 0.32, rig: { type: 'ots', body: 'E', dist: [70, 95], side: [34, 22], lift: [14, 18], aim: 0.06, fov: [32, 36], look: 'mid' } },
        { to: 0.68, rig: { type: 'lvlh', az: [1.15, 1.95], el: [0.1, 0.2], dist: [0.07, 0.095], fov: [34, 38], look: -7 } },
        { to: 1, rig: { type: 'lvlh', az: [1.95, 2.45], el: [0.2, 0.32], dist: [0.095, 0.32], fov: [38, 34], look: -7 } }] });
    // 4 Ay'a yolculuk
    const tc0 = t('SEP', 400), tcEnd = (has('LOI') ? P.LOI : P.SEP + 300000) - 1200, span = Math.max(4000, tcEnd - tc0), a = Math.min(span * 0.18, 90000), b = Math.min(span * 0.12, 40000);
    add_({ id: 'coast-a', dur: 4.5, wmax: 30000, T: () => [[0, tc0], [1, tc0 + a]], chapter: { short: 'Yolculuk', title: "AY'A YOLCULUK", sub: (c) => `Dünya'dan ${fmt(c.rE, 0)} km uzakta`, at: 0.3, hold: 3.4 },
      rig: { type: 'ots', body: 'E', dist: [58, 88], side: [30, 42], lift: [10, 15], aim: 0.05, fov: [34, 38], look: 'mid' }, dip: true });
    add_({ id: 'coast-b', dur: 8.5, wmax: 40000, T: () => [[0, tc0 + a], [1, tcEnd - b]], rig: { type: 'wide', cam: { mode: 'SYSTEM', az: [-1.75, -1.4], el: [0.95, 0.7], dist: [700000, 560000] }, fov: 40, yaw: -0.17 }, lines: true, syn: true, tags: true, beacon: true, dip: true });   // Ay'la dönen çerçeve, yörünge düzlemine yukarıdan: Dünya solda, Ay sağda, gidiş yolu S biçiminde
    add_({ id: 'coast-c', dur: 4.5, wmax: 20000, T: () => [[0, tcEnd - b], [1, tcEnd]], rig: { type: 'wide', cam: (c, e) => ({ mode: 'MOON', az: lerp(0.9, 1.5, e), el: 0.32, dist: lerp(90000, 9000, smooth(e)) }), fov: 40 }, lines: true, beacon: true, dip: false });
  }
  // 5 LOI
  if (has('LOI')) {
    add_({ id: 'loi-approach', dur: 4.5, wmax: 800, T: () => [[0, t('LOI', -1200)], [1, t('LOI', -75)]], rig: { type: 'ots', body: 'M', dist: [80, 70], side: [-36, -28], lift: [10, 6], aim: 0.08, fov: [34, 38], look: 'mid' }, dip: true });
    add_({ id: 'loi-burn', dur: 9, wmax: 90, T: () => [[0, t('LOI', -75)], [1, t('LOI', loiBurn)]], wf: (x, c) => (c.burnT < 0 ? clamp((P.LOI - 60 - x.t) / 2.2, 1.5, 40) : c.burnT < 2.5 ? 1 : 18), until: (x, c) => c.burnT >= 2.5 && !isBurn(x), minT: 3, shake: 0.5,
      chapter: { short: 'LOI', title: 'AY YÖRÜNGESİNE GİRİŞ', sub: (c) => `LOI · Ay'a göre ${fmt(c.vrel * 1000, 0)} m/s`, at: 0.8, hold: 3.6 },
      rigs: [{ to: 0.3, rig: { type: 'body', ref: 'engine', eye: [[9, -3.5, -12], [11, -2.5, -16]], tgt: [[0, 0, 4], [0, 0, 3]], fov: [32, 36], up: 'body' } },
        { to: 1, rig: { type: 'lvlh', az: [2.6, 3.7], el: [0.2, 0.3], dist: [0.05, 0.07], fov: [32, 36], look: 'mid' } }] });
    // 6 Ay yörüngesi: zaman atlaması
    const tl0 = t('LOI', loiBurn + 40), tl1 = Math.min(has('SEP2') ? P.SEP2 - 110 : has('PDI') ? P.PDI - 400 : tl0 + 12000, tl0 + 18000);       // en çok ~2,7 tur gösterilir; kalanı sonraki çekimin başında kararma altında geçilir
    add_({ id: 'llo', dur: 8, wmax: 2600, T: () => [[0, tl0], [1, Math.max(tl0 + 600, tl1)]], chapter: { short: 'Ay yörüngesi', title: 'AY YÖRÜNGESİ', sub: (c) => `Ay çevresinde ${fmt(c.alt, 0)} km irtifada`, at: 0.25, hold: 3.4 },
      rig: { type: 'wide', cam: (c, e) => lightCam(c.x, lerp(6400, 4300, e), 0.9, 0.3, lerp(0.95, 0.45, e), lerp(0.32, 0.2, e), 'MOON', E.moonPos(c.x.t)), fov: 42, yaw: [0.34, 0.24] }, lines: true, osc: true, beacon: true, dip: true });   // Güneş'in aydınlattığı yüz (gece yüzü değil); Ay kadrajın sağında (kart solda)
  }
  // 7 iniş kademesinin ayrılması
  if (has('SEP2')) {
    add_({ id: 'sep2', dur: 7.5, wmax: 400, T: () => [[0, t('SEP2', -110)], [0.35, t('SEP2', -6)], [0.45, t('SEP2', 0)], [1, t('SEP2', 70)]], chapter: { short: 'Kademe', title: 'İNİŞ KADEMESİ AYRILIR', sub: 'Ay yörünge kademesi geride kalır', at: 0.9, hold: 3.6 }, flashOnSep: true,
      rig: { type: 'lvlh', az: [1.5, 2.3], el: [0.12, 0.2], dist: [0.05, 0.04], fov: [30, 28], look: 'mid' }, dip: true });
  }
  // 8 motorlu iniş: zaman hızı irtifaya göre (planın tahmini temas anı gerçekten saparken de doğru yavaşlar); çekimler irtifa/evre koşullarıyla biter
  if (has('PDI') && has('INDI')) {
    const alt = (x) => (x.local ? x.local.p[2] : Infinity);
    // irtifa (km) → hedef zaman hızı: log-doğrusal ara değerleme; son metrelerde yavaş çekim
    const LW = [[12, 60], [4, 40], [1.6, 22], [0.6, 12], [0.25, 8], [0.08, 5.5], [0.025, 3.2], [0.008, 1.7], [0, 1.0]];
    const landWarp = (x) => { const a = Math.max(0, alt(x)); if (!Number.isFinite(a) || a > LW[0][0]) return LW[0][1]; for (let i = 0; i < LW.length - 1; i++) { const [a0, w0] = LW[i], [a1, w1] = LW[i + 1]; if (a <= a0 && a >= a1) { const k = (a0 - a) / Math.max(1e-9, a0 - a1); return Math.exp(lerp(Math.log(w0), Math.log(w1), k)); } } return LW[LW.length - 1][1]; };
    add_({ id: 'pdi', dur: 10, wmax: 70, T: () => [[0, t('PDI', -14)], [0.14, t('PDI', 0)], [1, t('PDI', 240)]], wf: (x, c) => (c.burnT < 0 ? clamp((P.PDI + 16 - x.t) / 2.2, 1.5, 40) : c.burnT < 2.4 ? 1.2 : landWarp(x)), until: (x) => alt(x) < 1.3 && x.t > P.PDI + 60, minT: 4, shake: 0.35,
      chapter: { short: 'İniş', title: 'MOTORLU İNİŞ', sub: land, at: 1.0, hold: 3.6 },
      rigs: [{ to: 0.2, rig: { type: 'body', ref: 'engine', eye: [[6, -2.5, -5], [7, -1.5, -8]], tgt: [[0, 0, 1.5], [0, 0, 1]], fov: [28, 32], up: 'body' } },
        { to: 1, rig: { type: 'lvlh', az: [2.1, 2.45], el: [0.12, 0.08], dist: [0.055, 0.04], fov: [34, 30], look: 'mid' } }], dip: true });
    add_({ id: 'approach', dur: 8, wmax: 40, T: () => [[0, t('PDI', 200)], [1, P.INDI]], wf: landWarp, until: (x) => alt(x) < 0.034, minT: 3, shake: 0.3,
      rig: { type: 'lvlh', az: [2.9, 2.3], el: [0.05, 0.13], dist: [0.04, 0.032], fov: [32, 28], look: 'mid' } });
    add_({ id: 'touchdown', dur: 14, wmin: 0.3, wmax: 20, T: () => [[0, P.INDI - 30], [1, P.INDI + 10]], wf: landWarp,
      until: (x, c) => (x.phase === 'INDI' || x.done) && c.sinceLand > 4.5, minT: 4, shake: 0.25,
      chapter: { short: 'Temas', title: 'TEMAS', sub: (c) => c.touch, at: 'land', hold: 3.8 },
      rig: { type: 'ground', fixed: true, x: [-40, -34], y: [118, 108], h: [1.7, 1.6], frame: [23, 11], fovMin: 10, fovMax: 46, aimUp: [7.5, 3.2] } });
    // kapanış: yüzey evresi (temastan +7 s motor emniyeti, +18 s duruş raporu, +45 s tank tahliyesi, +89 s kalış kararı; alt yazılar) — ~×7
    add_({ id: 'outro', dur: 17, wmin: 1, wmax: 9, T: () => [[0, P.INDI + 5], [0.2, P.INDI + 10], [1, P.INDI + 96]], closing: true,
      rig: { type: 'lvlh', az: [-2.5, -1.7], el: [0.1, 0.3], dist: [0.03, 0.075], fov: [34, 30], look: -1.2, yaw: [0.2, 0.26] } });
  }
  return S;
}

const tStart0 = (s, P) => s.T(P)[0][1];
// görev kontrol anonsları (konuşma sentezi): olay anahtarı → kısa söz (alt yazı gösterilirken söylenir)
export const SAY = { CONTACT: 'Temas ışığı', ENGINE_STOP: 'Motor durduruldu', LOS: "Ay'ın arkasındayız, sinyal kaybı", AOS: 'Sinyal alındı', LOI_END: 'Ay yörüngesindeyiz', STAY_T1: 'Yüzeyde kalış kararı: kal' };
const COUNT = isEn ? ['one', 'two', 'three', 'four', 'five'] : ['bir', 'iki', 'üç', 'dört', 'beş'];
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

  // plan (ui.plan) → anahtar:zaman; temas gerçekleştiyse INDI gerçek temas anıdır (plan tahmini ±40 s sapar: kapanış çekimi yüzey olaylarını kaçırmasın)
  planMap() { const P = {}; for (const p of this.h.ui.plan || []) P[p.key] = p.t; if (this.simLand != null) P.INDI = this.simLand; return P; }

  async start(opts = {}) {
    if (this.on || !this.h.latest() || !this.h.ui.plan || !this.h.ui.plan.length) return false;
    this.on = true; this.state = 'boot'; this.opts = { scale: 1, ...opts }; this.simLand = null;
    const W = this.h.world, chk = document.querySelector('#chkAutoWarp');
    this.saved = { cam: { ...W.cam }, autoWarp: chk ? chk.checked : true, running: this.h.running(), warp: (this.h.latest() || {}).warpSet || 1 };
    this.h.onStart && this.h.onStart();
    await W.setCinematic(true, { onLevel: (l) => this.onLevel(l), level: this.opts.quality });
    if (!this.on) { await W.setCinematic(false); return false; }                 // yüklenirken iptal
    const ui = this.ui; ui.enter(); ui.fade(1, 0); ui.quality(W.cine.level === 'ultra' ? '4K' : 'HD');
    if (this.audio) this.audio.stop();
    this.audio = new CineAudio(); if (!this.opts.preview) this.audio.start();
    ui.setMuted(this.audio.muted); ui.muteBtn.onclick = () => this.toggleMute();
    this.keyHandler = (e) => this.key(e); window.addEventListener('keydown', this.keyHandler, true);
    this.moveHandler = () => { ui.root.classList.add('active'); clearTimeout(this.activeTimer); this.activeTimer = setTimeout(() => ui.root.classList.remove('active'), 2600); };
    window.addEventListener('pointermove', this.moveHandler, { passive: true });
    ui.exitBtn.onclick = () => this.stop();
    // görev baştan: worker 'restarted' dönünce (app.js onRestarted) çekimler başlar
    this.h.send({ cmd: 'autoWarp', on: false });
    // kalkış açılışı: tasarımın roketi kalkış verisi taşıyorsa ve kalkış oynatıcısı varsa (önizlemede yok)
    const D = this.h.ui.design, rk = D && D.STAGES && D.STAGES[0] ? rocketOf(D.STAGES[0].rocket) : null, RA = rk && rk.ascent;
    this.asc = !this.opts.preview && this.opts.ascent !== false && RA && this.h.ascent && this.h.ascent()
      ? { events: RA.events || [], tIns: RA.tIns, dur: ascentDuration(RA.events || [], RA.tIns), rocket: rk.name, site: ((D.LAUNCH && D.LAUNCH.site) || rk.pad || '').replace(/\s*\([^()]*\)\s*$/, '') } : null;          // rampa adı (koordinatsız)
    this.P0 = this.planMap();                                                         // çekim eğrileri bu nesneyi kapanışta tutar (temas anı sonradan buraya yazılır)
    this.shots = buildShots(this.P0, { landing: this.h.landing && this.h.landing(), ascent: !!this.asc });
    this.i = -1; this.shot = null; this.paused = false; this.pending = null; this.lastStep = performance.now(); this.cues = []; this.cueNext = 0;
    let n = this.asc ? 1 : 0;                                                       // kalkış bölümü 01
    for (const s of this.shots) if (s.chapter) s.chIdx = ++n;
    this.chTotal = n;
    ui.ticks(this.tickMarks());
    if (this.opts.preview) { this.state = 'preview'; ui.fade(0, 0); }               // deneme: çekimler elle (preview) gösterilir, görev yeniden kurulmaz
    else { this.h.send({ cmd: 'restart' }); this.restartAt = performance.now(); }
    // denetim, çizimden bağımsız zamanlayıcıyla (kare hızı düşse de zaman hızı ve çekim süreleri gerçek zamanda yürür)
    this.timer = setInterval(() => { const now = performance.now(), dt = Math.min(0.25, (now - this.lastStep) / 1000); this.lastStep = now; this.tick(dt); }, 30);
    return true;
  }
  // başlık kartının alt satırları: kalkış tarihi (UTC), roket ve rampa
  titleLines() {
    const a = this.asc || {}, ms = E.utcMsFromT ? E.utcMsFromT(this.h.ui.tLaunch || 0) : null;
    const date = ms != null && Number.isFinite(ms) ? new Date(ms).toLocaleDateString(LOC, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) + ' · ' + new Date(ms).toISOString().slice(11, 16) + ' UTC' : '';
    return [date, [a.rocket, a.site].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
  }
  // geniş çekimlerde cisim etiketleri (çekimde tags: true): Dünya, Ay ve araç ekrandaki yerlerinde, uzaklıklarıyla
  tagsFor(x) {
    const W = this.h.world, cam = W.camera, eye = W.eye, cv = W.canvas; if (!eye || !cv) return [];
    const w = cv.clientWidth, h = cv.clientHeight, rm = E.moonPos(x.t), v = this._tv || (this._tv = new THREE.Vector3()), out = [];
    const put = (k, name, sub, p) => { v.set(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]).project(cam); if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 0.96 || Math.abs(v.y) > 0.9) return; out.push({ k, name, sub, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h }); };
    const km = (d) => fmt(d, 0) + ' km', rE = norm(x.r), rM = norm(sub(x.r, rm));
    put('E', translateText('Dünya'), '', [0, 0, 0]); put('M', translateText('Ay'), km(norm(rm)), rm);
    put('V', 'LS19', `${translateText("Dünya'ya")} ${km(rE)} · ${translateText("Ay'a")} ${km(rM)}`, x.r);
    return out;
  }
  ascDur() { return this.asc ? this.asc.dur * this.opts.scale : 0; }
  tickMarks() { const a = this.ascDur(), sum = a + this.shots.reduce((q, s) => q + this.durOf(s), 0); let acc = a; const out = this.asc ? [{ p: 0, label: translateText('Kalkış') }] : []; for (const s of this.shots) { if (s.chapter) out.push({ p: acc / sum, label: translateText(s.chapter.short || '') }); acc += this.durOf(s); } return out; }
  durOf(s) { return (s.durEff || s.dur) * this.opts.scale; }

  onRestarted() {
    if (!this.on || this.state !== 'boot') return;
    this.state = 'wait'; this.restartAt = performance.now();
  }

  stop() {
    if (!this.on) return;
    this.on = false; this.state = 'idle'; clearInterval(this.timer); this.timer = 0;
    this.stopAscent();
    if (this.audio) { this.audio.stop(); this.audio = null; }
    const W = this.h.world, ui = this.cu;
    window.removeEventListener('keydown', this.keyHandler, true); window.removeEventListener('pointermove', this.moveHandler);
    W.cine.rig = null; W.cine.syn = false; W.cine.lines = false; W.cine.osc = false; W.cine.beacon = false;
    Object.assign(W.cam, this.saved.cam);
    this.h.send({ cmd: 'autoWarp', on: this.saved.autoWarp }); this.h.send({ cmd: 'warp', value: this.saved.warp });
    const chk = document.querySelector('#chkAutoWarp'); if (chk) chk.checked = this.saved.autoWarp;
    this.h.play(this.saved.running);
    if (ui) ui.leave();
    W.setCinematic(false);
    this.h.onStop && this.h.onStop();
  }

  // kalite rozeti (4K: iç çözünürlük 3840 × 2160; HD: ekran çözünürlüğü); kademe düşünce kısa bilgi kartı
  onLevel(l) { if (!this.cu) return; this.cu.quality(l === 'ultra' ? '4K' : 'HD'); if (l !== 'ultra') this.cu.cue(translateText(l === 'high' ? 'Yüksek: 4K yerine ekran çözünürlüğü' : l === 'medium' ? 'Orta: çizgi parlama ve MSAA kapalı' : 'Düşük: son işlem kapalı'), 2600); }   // küçük alt yazı: başlık ve bölüm kartlarının yerini almaz

  key(e) {
    const k = e.key.toLowerCase();
    if (k === 'escape') { e.preventDefault(); e.stopPropagation(); this.stop(); return; }
    if (k === ' ') { e.preventDefault(); e.stopPropagation(); this.setPaused(!this.paused); return; }
    if (k === 'arrowright') { e.preventDefault(); e.stopPropagation(); this.skip(); return; }
    if (k === 'm') { e.preventDefault(); e.stopPropagation(); this.toggleMute(); return; }
    if (k === 'r' && (this.state === 'ended' || this.state === 'run')) { e.preventDefault(); e.stopPropagation(); this.restart(); return; }
    e.stopPropagation();                                                          // sinematik kipte diğer kısayollar kapalı
  }
  setPaused(on) {
    this.paused = on; if (this.state !== 'ascent' && this.state !== 'asc-boot') this.h.play(!on); this.ui.paused = on;   // kalkışta fizik zaten duraklı (kalkış oynatıcısı hızı 0'a çeker)
    const hint = this.ui.f.hint; hint.innerHTML = on ? '<kbd>Boşluk</kbd> devam · <kbd>Esc</kbd> çık' : '<kbd>Esc</kbd> çık · <kbd>Boşluk</kbd> duraklat · <kbd>→</kbd> sonraki çekim · <kbd>M</kbd> ses aç/kapat'; hint.classList.toggle('show', on);
    if (!on) this.ui.showHint(false);
  }
  toggleMute() { if (!this.audio) return; this.audio.setMuted(!this.audio.muted); this.ui.setMuted(this.audio.muted); }
  skip() { if (this.state === 'ascent') { this.stopAscent(); return; } if (this.shot && !this.shot.closing) this.endShot(true); }
  async restart() { const o = this.opts; this.stopAscent(); if (this.audio) { this.audio.stop(); this.audio = null; } this.ui.leave(true); this.on = false; this.state = 'idle'; clearInterval(this.timer); this.timer = 0; window.removeEventListener('keydown', this.keyHandler, true); window.removeEventListener('pointermove', this.moveHandler); this.h.world.cine.rig = null; await this.h.world.setCinematic(false); await this.start(o); }

  // ----- çekim yaşam döngüsü
  // çekimi kur (zaman eğrisi, kamera, bayraklar); atlama mantığı startShot'ta
  beginShot(i, tau0 = 0) {
    const P = this.planMap(), W = this.h.world, s = this.shots[i], x = this.h.latest();
    this.i = i; this.shot = s; this.shotT = tau0 * this.durOf(s); this.cardDone = false; this.landT = null; this.burnStart = null; this.sepSeen = (x.debris || []).length; this.qInit = false;
    const T = s.T(P); s.keys = T; s.f = pchip(T.map((k) => k[0]), T.map((k) => k[1])); s.tEnd = T[T.length - 1][1]; s.tStart = T[0][1];
    // süre: istenen zaman hızı sınırını aşmasın (aşıyorsa uzar)
    const span = Math.max(0, s.tEnd - s.tStart); s.durEff = Math.max(s.dur, span / ((s.wmax || 20000) * 0.85));
    W.cam.auto = false; W.cam.mode = 'CINE'; W.cine.rig = (xx, info, ww) => this.pose(xx, info, ww);
    W.cine.lines = !!s.lines; W.cine.syn = !!s.syn; W.cine.osc = !!s.osc; W.cine.beacon = !!s.beacon;
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
    // kalkıştan sonra (post-asc) ekran karartılmıştır: açılış çekimi kararma istemese de (dip: false) karartma kalkmalı — yoksa "YÖRÜNGEDE" çekimi boyunca ekran siyah kalır
    if (s.dip) ui.fade(0, 520); else if (this.state === 'wait' || this.state === 'post-asc') ui.fade(0, 900);
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
    const a = this.ascDur(); let sum = a, acc = a; for (let k = 0; k < this.shots.length; k++) { const d = this.durOf(this.shots[k]); if (k < i) acc += d; sum += d; }
    if (i < 0) return (tau * a) / Math.max(1, sum);                                // kalkış açılışı (tau: oynatılan kesir)
    return (acc + tau * this.durOf(this.shots[i])) / Math.max(1, sum);
  }

  // ----- kalkış açılışı: kalkış oynatıcısı (ascentplay.js) sessiz kipte; fizik worker'ı onun süresince duraklar, bitince görev girişten sürer (app.js onEnd)
  async startAscent() {
    const A = this.h.ascent(), a = this.asc, ui = this.ui;
    this.state = 'asc-boot';
    const ok = await A.start({ quiet: true, from: ASC.FROM, onCue: (text, ms) => { if (this.on && this.state === 'ascent') ui.cue(text, Math.min(ms || 3200, 3600)); }, onCredit: (text) => { if (this.on) ui.credit(text); } });
    if (!this.on) { if (ok) await A.stop(); return; }
    if (!ok) { this.asc = null; ui.ticks(this.tickMarks()); this.h.send({ cmd: 'warp', value: 1 }); this.h.play(true); this.wall = 0; this.startShot(0); return; }
    a.wall0 = this.wall; a.card = false; a.chap = false; a.warp = 1; a.real = ASC.FROM; a.prev = ASC.FROM;
    if (this.audio) this.audio.chapter(0);
    this.state = 'ascent'; ui.root.classList.remove('nostrip'); ui.fade(0, 900);
  }
  stopAscent() { const A = this.h.ascent && this.h.ascent(); if (A && A.active) A.stop(); }
  tickAscent(dt) {
    const A = this.h.ascent(), a = this.asc, ui = this.ui;
    if (!A.active) { this.state = 'post-asc'; this.restartAt = performance.now(); ui.fade(1, 0); ui.credit(''); return; }   // bitti: app.js onEnd görevi girişe sarar
    if (!this.paused) this.wall += dt;
    const real = A.real ?? ASC.FROM, prev = a.prev ?? real; a.real = real; a.prev = real;
    // ses: geri sayım (5 … 1), kalkış anonsu, motor (atmosferde güçlü), ayrılmalarda çarpma
    const au = this.audio;
    if (au) {
      // geri sayım: her saniye tık + sayı (yalnız en son geçilen sayı söylenir: kare atlarsa sayılar üst üste binmez); kalkışta uzun ton
      // tık tam saniyede çalar; sayı, konuşma sentezinin ölçülen başlama gecikmesi (au.lead) kadar ERKEN söyletilir ki ses tıkla aynı anda duyulsun
      const ld = au.lead, pl = prev + ld, rl = real + ld;
      for (let n = 5; n >= 1; n--) { if (prev < -n && real >= -n) au.tick(); if (pl < -n && rl >= -n && rl < -n + 0.6) au.say('cd' + n, COUNT[n - 1], { urgent: true }); }
      if (prev < 0 && real >= 0) au.tick(true);
      if (pl < 0 && rl >= 0) au.say('lift', translateText('Ateşleme… kalkış!'), { urgent: true });
      for (const e of a.events) if ((e.cut != null || e.part) && prev < e.t && real >= e.t) au.thump();
      const h = A.hud, thr = h && h.asc ? h.asc.thr : real >= 0 ? 1 : 0;
      au.update(this.paused ? 0 : thr, this.paused ? 1 : a.warp, !h || (h.altKm || 0) < 70);
    }
    const wT = this.paused ? 0 : ascentWarp(real, a.events, a.tIns);
    a.warp = wT > a.warp ? a.warp + (wT - a.warp) * (1 - Math.exp(-dt / 0.35)) : wT;          // artışta yumuşak, azalışta anında (pencereyi kaçırmasın)
    A.warp = a.warp;
    const el = this.wall - a.wall0;
    if (!a.card && el >= 0.5) { a.card = true; ui.card({ kind: 'title', over: translateText('Ay görevi'), title: 'LS19', sub: this.titleLines(), hold: 4.6 }); }
    if (!a.chap && real >= 2.5) { a.chap = true; if (this.audio) this.audio.chapter(1); ui.card({ kind: 'chapter', idx: 1, total: this.chTotal, title: 'KALKIŞ', sub: `${a.rocket}${a.site ? ' · ' + a.site : ''}`, hold: 3.8 }); }
    // veri şeridi: kalkış oynatıcısının göstergesi (WGS-84 irtifa, yere göre hız)
    const now = performance.now();
    if (now - this.lastStrip >= 120 && A.hud) {
      this.lastStrip = now; const h = A.hud, met = Math.round(real), spd = h.asc ? h.asc.spd : 0;
      const fa = (x) => (x > 2 ? fmt(x, x > 100 ? 0 : 1) + ' km' : fmt(x * 1000, 0) + ' m'), fv = (v) => (v > 0.1 ? fmt(v, 3) + ' km/s' : fmt(v * 1000, 0) + ' m/s');
      ui.strip({ met: met < 0 ? 'T−' + fmtDur(-met) : 'T+' + fmtDur(met), phase: real < 0 ? 'Geri sayım' : 'Kalkış', chap: 'Aşama', k1: 'İrtifa', v1: fa(Math.max(0, h.altKm || 0)), k2: 'Hız', v2: fv(spd), warp: A.warp > 1.05 ? 'Hızlandırılmış' : 'Gerçek zaman' });
    }
    ui.progress(this.progressAt(-1, clamp(ascentDuration(a.events, a.tIns, ASC.FROM, real) / Math.max(1, a.dur), 0, 1)));   // uçuş zamanına göre (kare hızından bağımsız)
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
  // irtifa (HUD ile aynı tanım): Dünya'da gerçek kutupla WGS-84, Ay'da ortalama yarıçap; yalnız motorlu inişte (PDI → temas) iniş yeri yüzeyine göre
  alt(x, info) {
    const rs = norm(sub(x.r, E.moonPos(x.t))), nearM = rs < E.MOON_ZONE;
    return nearM ? (x.local && POWERED.has(x.phase) ? x.local.p[2] : rs - E.R_M) : ellipsoidAlt(x.r, E.earthIcrfToItrf(x.t)[2]);
  }

  // ----- olay alt yazıları: kuyruk, en az CUE_GAP s arayla; yüksek zaman hızında art arda gelenlerden eskiler (> CUE_AGE s) ve düşük öncelikliler düşer
  onEvents(evs, disp) {
    if (!this.on || (this.state !== 'run' && this.state !== 'ended') || this.pending) return;      // bitişten sonra da (yüzey olayları sürer)
    const q = this.cues || (this.cues = []);
    for (const e of [...evs, ...disp]) { const c = cueOf(e); if (c) q.push({ ...c, key: e.key, at: this.wall }); }
    if (q.length > 3) { q.sort((a, b) => b.pri - a.pri || a.at - b.at); q.length = 3; q.sort((a, b) => a.at - b.at); }
  }
  tickCues() {
    const q = this.cues; if (!q || !q.length || this.wall < (this.cueNext || 0)) return;
    while (q.length && this.wall - q[0].at > 8) q.shift();
    const c = q.shift(); if (!c) return;
    this.ui.cue(c.text, 2600); this.cueNext = this.wall + 2.4;
    if (this.audio) { if (c.key === 'CONTACT') this.audio.beep(); if (SAY[c.key]) this.audio.say(c.key + (c.key === 'LOS' || c.key === 'AOS' ? Math.floor(this.wall) : ''), translateText(SAY[c.key])); }
  }

  // ----- her kare (app.js, world.update'ten önce)
  tick(dt) {
    if (!this.on) return;
    const x = this.h.latest(); if (!x) return;
    this.reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.dt = dt;
    const ui = this.ui;
    if (this.state === 'boot' || this.state === 'preview' || this.state === 'asc-boot') return;
    if (this.state === 'ascent') { this.tickAscent(dt); return; }
    if (this.state === 'post-asc') {                                                // kalkış bitti: görev girişe sarılınca (t ≈ INS) çekimler başlar
      const P = this.planMap();
      if (performance.now() - this.restartAt > 250 && Math.abs(x.t - P.INS) < 400) { this.h.send({ cmd: 'warp', value: 1 }); this.h.play(true); this.startShot(0); }
      return;
    }
    if (this.state === 'catch') {
      const c = this.catchUp, behind = c.tStart - x.t;
      if (behind <= 0.8 || this.wall - c.t0 > 30) { this.state = 'run'; this.warpCmd = 1; this.h.send({ cmd: 'warp', value: 1 }); this.startShotNoCatch(c.i); }
      else { const w = clamp(behind / 0.9, 1, 40000); this.warpCmd = w; if (performance.now() - this.lastSend > 60) { this.lastSend = performance.now(); this.h.send({ cmd: 'warp', value: w }); } this.wall += dt; }
      return;
    }
    if (this.state === 'wait') {
      // yeni görev kuruldu ve ilk durum geldi mi (t ≈ INS)
      const P = this.planMap();
      if (performance.now() - this.restartAt > 250 && Math.abs(x.t - P.INS) < 400) {
        this.wall = 0;
        if (this.asc) { this.h.play(false); this.startAscent(); }
        else { this.h.send({ cmd: 'warp', value: 1 }); this.h.play(true); this.startShot(0); }
      }
      return;
    }
    if (this.paused) { this.dt = 0; }
    else this.wall += dt;
    if (this.pending && this.wall >= this.pending.at) { const n = this.pending.i; this.pending = null; this.startShot(n); }
    const s = this.shot; if (!s) return;
    if (this.state === 'ended') { this.tickCues(); this.strip(x); return; }
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
    if (x.phase === 'INDI' || x.done) { if (this.landT == null) this.landT = this.shotT; if (this.simLand == null) { this.simLand = x.result && x.result.tContact != null ? x.result.tContact : x.t; if (this.P0) this.P0.INDI = this.simLand; } } else this.landT = null;
    if (this.paused) w = 1;
    // artışta yumuşak, azalışta anında (olayı geçmesin)
    this.warpCmd = w > this.warpCmd ? this.warpCmd + (w - this.warpCmd) * (1 - Math.exp(-dt / 0.35)) : w;
    if (performance.now() - this.lastSend > 60 && Math.abs(this.warpCmd - (this.lastWarp || 0)) > Math.max(0.02, 0.02 * this.warpCmd)) { this.lastSend = performance.now(); this.lastWarp = this.warpCmd; this.h.send({ cmd: 'warp', value: this.warpCmd }); }
    // olaylar: ayrılma parlaması
    const nd = (x.debris || []).length; if (nd > this.sepSeen) { if (s.flashOnSep && !this.reduced) ui.flash(); if (this.audio) this.audio.thump(); this.sepSeen = nd; }
    if (this.audio) this.audio.update(this.paused || !isBurn(x) ? 0 : x.thr, this.warpCmd, false);
    // kartlar
    const atT = s.chapter && (s.chapter.at === 'land' ? (this.landT != null ? this.shotT - this.landT >= 0.2 : false) : this.shotT >= s.chapter.at);
    if (!this.cardDone && s.chapter && atT) {
      this.cardDone = true; const c = this.ctxText(x), ch = s.chapter;
      if (this.audio) this.audio.chapter(s.chIdx);
      ui.card({ kind: 'chapter', idx: s.chIdx, total: this.chTotal, title: ch.title, sub: typeof ch.sub === 'function' ? ch.sub(c) : ch.sub, hold: ch.hold });
    }
    if (!this.cardDone && s.card && this.shotT >= s.card.at) { this.cardDone = true; ui.card({ kind: s.card.kind, title: s.card.title, sub: s.card.sub, hold: s.card.hold }); }
    if (s.closing && !this.cardDone && this.shotT >= 3.2) { this.cardDone = true; if (this.audio) this.audio.chapter(7); this.closingCard(x); }
    this.tickCues();
    ui.tags(s.tags && !this.pending ? this.tagsFor(x) : []);
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
    return { x, alt: this.alt(x), rE: norm(x.r), rM: norm(rs), vrel, touch, stage: st };
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
    ui.strip({ met: 'T+' + fmtDur(met), phase: this.h.ui.phaseLabel ? this.h.ui.phaseLabel(x.phase) : x.phase, chap: this.state === 'ended' ? 'Gösterim bitti' : 'Aşama', k1, v1, k2, v2, warp: w > 1.05 ? 'Hızlandırılmış' : 'Gerçek zaman' });
  }

  closingCard(x) {
    const ui = this.ui, r = x.result || {}, ok = r.ok !== false;
    (async () => {
      const dvUsed = (x.dv || 0) * 1000, met = x.t - (this.h.ui.tLaunch || 0);
      const stats = await ui.summary([
        { label: 'Görev süresi', text: 'T+' + fmtDur(met) },
        { label: 'Kullanılan Δv', value: dvUsed, unit: 'm/s', format: { maximumFractionDigits: 0 } },
        { label: 'Temas: dikey', value: r.v_mps ? Math.abs(r.v_mps[2]) : 0, unit: 'm/s', format: { minimumFractionDigits: 2, maximumFractionDigits: 2 } },
        { label: 'Kalan yakıt', value: r.prop != null ? r.prop : (x.prop || 0), unit: 'kg', format: { maximumFractionDigits: 0 } }]);
      const d = ui.card({ kind: 'close', title: ok ? 'İNİŞ BAŞARILI' : 'GÖREV SONA ERDİ', sub: 'LS19 · Look Star 19', extra: '' });
      ui.root.classList.add('nostrip');                                               // özet kartı aynı değerleri gösterir: veri şeridi söner (zaman çizelgesi kalır)
      d.appendChild(stats.box); setTimeout(() => stats.run(), 1100);
      // jenerik: veri ve model kaynakları (özetten sonra belirir)
      const cr = ui.credits([[translateText('Efemeris ve yönelim'), 'JPL DE440 · IAU/IERS · GRAIL (GRGM)'], [translateText('Modeller'), 'NASA 3D Resources'],
        [translateText('Görüntü ve harita'), 'NASA · Esri World Imagery · © OpenStreetMap · OpenFreeMap'], [translateText('Benzetim'), translateText('LS19 · gerçek efemeris, N-cisim fiziği')]]);
      d.appendChild(cr); ui.after(4200, () => cr.classList.add('in'));
    })();
  }
}
