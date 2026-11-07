// Kalkış yayını kurgusu (saf; Node'da sınanır: test/test_launchcam.js). Her kamera gerçek bir yayın kamerasıdır ve yalnız oradan görülebileni gösterir:
//   geniş rampa çekimi (helikopter; geri sayım) → rampa kamerası (rampanın dibinde uzaktan kumandalı; ateşleme, kalkış) → yer izleme (rampanın 1,4 km
//   yanındaki tele izleme montajı) → takip uçağı (NASA WB-57 / WAVE gibi 18,3 km irtifada, uçuş yönünde ~80 km ötede uçan yüksek irtifa uçağının tele
//   kamerası) → araç üstü kamera (Max-Q, kademe ayrılmaları; yer ve uçak aracı ufukta kaybedince tek gerçek görüntü budur).
// Görünürlük gerçek: kamera ile roket arasındaki doğru Dünya'ya değerse (roket ufkun altında) o kamera kullanılmaz; kullanıcı o kamerayı seçtiyse araç
// üstü kameraya geçilir ve etikette nedeni yazılır. Kesmeler serttir (yayındaki gibi).
// Girdi: met (gerçek uçuş saniyesi; kalkıştan önce negatif), h (km), events ([{ t, cut?, part?, name }] gerçek s), maxQ ({ t }), user ('auto'|'ground'|'air'|'onboard'),
//   see ({ track: { ok, dist }, air: { ok, dist } }: kameralardan görüş, ascentplay.js hesaplar; verilmezse görünür ve yakın sayılır).
// Çıktı: { shot: 'wide'|'pad'|'track'|'air'|'onboard', mount (araç üstü kameranın gövdedeki yüksekliği, m; null: gövde boyunun %60'ı), key (kesme kimliği),
//   slow (yavaş çekim penceresi), note (kamera aracı kaybettiyse açıklama) }.

const ONBOARD_PRE = 5, ONBOARD_POST = 16;                     // ayrılma çevresinde araç üstü pencere (gerçek s)
export const SHOT_NAMES = { wide: 'Geniş rampa çekimi (helikopter)', pad: 'Rampa kamerası', track: 'Yer izleme (tele)', air: 'Takip uçağı (18 km)', onboard: 'Araç üstü kamera' };
// kamera yerleri: rampa çerçevesinde km (side: up × dr yönü, dr: uçuş yönünün yatay bileşeni, up: rampada yerel dikey)
export const SITES = {
  track: { side: -1.4, dr: -0.42, up: 0.012 },                // yer izleme montajı: uçuş yönüne dik ~1,4 km, yerden 12 m; uçuş kadrajın sağına akar
  air: { side: -40, dr: 70, up: 18.3 },                       // takip uçağı: 60.000 ft (18,3 km), 70 km uçuş yönünde, 40 km yanda (yörüngede tur atar; yerinde sayılır)
};
export const AUTO_TRACK_KM = 50;                              // kurgu: yer izleme roket bu uzaklığa dek (sonra uçak); uçak bu uzaklığa dek (sonra araç üstü)
export const AUTO_AIR_KM = 900;
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// rampa çerçevesi P = { pos (km, Dünya merkezinden), up, dr } → kamera yerinin konumu (aynı çerçeve, km)
export function siteEye(P, site) {
  const side = cross3(P.up, P.dr);
  return [0, 1, 2].map((k) => P.pos[k] + side[k] * site.side + P.dr[k] * site.dr + P.up[k] * site.up);
}
// görüş hattı: göz → hedef doğru parçası R yarıçaplı küreye değmiyor mu (merkez orijinde; margin km: yüzeydeki göz ve hedef için pay)
export function lineOfSight(eye, tgt, R, margin = 0.003) {
  const d = sub3(tgt, eye), L2 = dot3(d, d); if (!(L2 > 0)) return true;
  const u = Math.max(0, Math.min(1, -dot3(eye, d) / L2)), c = [eye[0] + d[0] * u, eye[1] + d[1] * u, eye[2] + d[2] * u];
  return Math.hypot(...c) >= R - margin;
}
// kameradan görüş: { ok, dist (km) }
export function sight(eye, tgt, R) { return { ok: lineOfSight(eye, tgt, R), dist: Math.hypot(...sub3(tgt, eye)) }; }
// rampa zemini (padground.js, rampa merkezli rMax km yarıçaplı kare) kameranın gördüğü yeri kapsıyor mu: kameranın altındaki noktanın rampaya uzaklığı +
// kameranın ufuk uzaklığı karenin %90'ından azsa evet (o zaman Dünya küresi gizlenir, zemin ufka dek çizer); değilse küre çizilir, zemin gizlenir.
export function groundCovers(eye, padPos, R, rMax = 1650) {
  const re = Math.hypot(...eye), rp = Math.hypot(...padPos), hc = Math.max(0, re - R);
  const ang = Math.acos(Math.max(-1, Math.min(1, dot3(eye, padPos) / (re * rp))));
  return R * ang + Math.sqrt(2 * R * hc + hc * hc) < 0.9 * rMax;
}

// araç üstü pencereler: Max-Q çevresi ve her ayrılma (kesme ya da parça atma)
export function onboardWindows(events, maxQ) {
  const w = [];
  if (maxQ && maxQ.t > 20) w.push({ t0: maxQ.t - 4, t1: maxQ.t + 10, mount: null, key: 'maxq', slow: false });
  for (const e of events || []) if (e.cut != null || e.part === 'booster') w.push({ t0: e.t - ONBOARD_PRE, t1: e.t + ONBOARD_POST, mount: e.cut != null ? e.cut + 12 : null, key: 'sep' + e.t, slow: true });
  w.sort((a, b) => a.t0 - b.t0);
  for (let i = 1; i < w.length; i++) if (w[i].t0 < w[i - 1].t1) { if (w[i].slow) w[i - 1].t1 = w[i].t0; else w.splice(i--, 1); }   // çakışan: ayrılma öncelikli
  return w;
}
// araç üstü kameranın yeri: son kesmeden sonra üst kademede (kesme + 12 m), yoksa gövde boyunun %60'ı
const mountAt = (events, met) => { let m = null; for (const e of events || []) if (e.cut != null && met >= e.t) m = e.cut + 12; return m; };

export function directShot({ met, events, maxQ, user = 'auto', see = null }) {
  const vis = (k) => !see || !see[k] || see[k].ok, far = (k, km) => see && see[k] && see[k].dist > km;
  const onboard = (note, key) => { const mount = mountAt(events, met); return { shot: 'onboard', mount, key: key + mount, slow: false, note }; };
  if (user === 'ground') return vis('track') ? { shot: 'track', mount: null, key: 'u-ground', slow: false, note: null } : onboard('yer kamerası aracı ufukta kaybetti', 'u-ground-lost');
  if (user === 'air') return vis('air') ? { shot: 'air', mount: null, key: 'u-air', slow: false, note: null } : onboard('takip uçağı aracı ufukta kaybetti', 'u-air-lost');
  if (user === 'onboard') return onboard(null, 'u-onboard');
  if (met < -3) return { shot: 'wide', mount: null, key: 'wide', slow: false, note: null };
  if (met < 7) return { shot: 'pad', mount: null, key: 'pad', slow: false, note: null };
  for (const w of onboardWindows(events, maxQ)) if (met >= w.t0 && met < w.t1) return { shot: 'onboard', mount: w.mount, key: w.key, slow: w.slow, note: null };
  if (vis('track') && !far('track', AUTO_TRACK_KM)) return { shot: 'track', mount: null, key: 'track', slow: false, note: null };
  if (vis('air') && !far('air', AUTO_AIR_KM)) return { shot: 'air', mount: null, key: 'air', slow: false, note: null };
  return onboard(null, 'onboard');
}

// otomatik hız (kullanıcı seçmediyse): kalkış gerçek hızda, ayrılmalar ×2 (yavaş çekim), arada ×10
export const autoWarp = (met, slow) => (met < 20 ? 1 : slow ? 2 : 10);

// kamera sarsıntısı (km): yer kameralarında kalkışın ses basıncı (yakında ve ilk saniyelerde güçlü), araç üstünde dinamik basınç ve motor titreşimi.
// Deterministik (zamana bağlı sinüs toplamı; aynı anda aynı sarsıntı) — 3 eksenli ofset döner.
export function shake(shot, met, { thr = 1, q = 0, dist = 1 } = {}) {
  let a = 0;
  if ((shot === 'pad' || shot === 'track' || shot === 'wide') && met > 0) a = 0.00025 * thr * Math.exp(-met / 9) / Math.max(0.25, dist);
  else if (shot === 'onboard') a = (0.00004 + 0.00012 * Math.min(1, q / 30000)) * thr;
  else if (shot === 'air') a = 0.000012 * Math.max(1, dist / 100);            // uçak gövdesinin titreşimi: tele objektifte kadraj hafif oynar (uzaklıkla, km)
  if (a <= 0) return [0, 0, 0];
  const s = (f, p) => Math.sin(met * f + p);
  return [a * (s(37.1, 0.3) * 0.6 + s(13.7, 1.1) * 0.4), a * (s(41.3, 2.0) * 0.6 + s(17.9, 0.7) * 0.4), a * (s(29.7, 4.1) * 0.6 + s(11.3, 2.9) * 0.4)];
}

// telemetri zaman çizgisi: [{ t, name, kind }] gerçek s, yörüngeye girişle biter
export function timeline(events, maxQ, tIns) {
  const out = [];
  if (maxQ && maxQ.t > 0) out.push({ t: maxQ.t, name: 'Max-Q', kind: 'q' });
  for (const e of events || []) out.push({ t: e.t, name: e.name, kind: e.cut != null ? 'sep' : 'part' });
  out.push({ t: tIns, name: 'Yörünge', kind: 'orbit' });
  return out.sort((a, b) => a.t - b.t);
}
