// Kalkış yayını kurgusu (saf; Node'da sınanır: test/test_launchcam.js). NASA/SpaceX canlı yayınlarının çekim dili:
//   geniş rampa çekimi (geri sayım) → rampa dibinden yakın çekim (ateşleme, kalkış) → yerden tele objektifle izleme (dikey yükseliş, yunuslama)
//   → takip kamerası (arkadan, ufuk kadrajda) → araç üstü kamera (Max-Q, kademe ayrılmaları: aşağı, ayrılan kademeye bakar) → takip.
// Kesmeler serttir (yayındaki gibi); yer → takip geçişi irtifayla yumuşak (scene.js LAUNCH).
// Girdi: met (gerçek uçuş saniyesi; kalkıştan önce negatif), h (km), events ([{ t, cut?, part?, name }] gerçek s), maxQ ({ t }), user ('auto'|'ground'|'chase'|'onboard').
// Çıktı: { shot: 'wide'|'pad'|'track'|'chase'|'onboard', mount (araç üstü kameranın gövdedeki yüksekliği, m; null: gövde boyunun %60'ı), key (kesme kimliği), slow (yavaş çekim penceresi) }.

export const ONBOARD_PRE = 5, ONBOARD_POST = 16;                     // ayrılma çevresinde araç üstü pencere (gerçek s)
export const SHOT_NAMES = { wide: 'Geniş rampa çekimi', pad: 'Rampa kamerası', track: 'Yer izleme (tele)', chase: 'Takip kamerası', onboard: 'Araç üstü kamera' };

// araç üstü pencereler: Max-Q çevresi ve her ayrılma (kesme ya da parça atma)
export function onboardWindows(events, maxQ) {
  const w = [];
  if (maxQ && maxQ.t > 20) w.push({ t0: maxQ.t - 4, t1: maxQ.t + 10, mount: null, key: 'maxq', slow: false });
  for (const e of events || []) if (e.cut != null || e.part === 'booster') w.push({ t0: e.t - ONBOARD_PRE, t1: e.t + ONBOARD_POST, mount: e.cut != null ? e.cut + 12 : null, key: 'sep' + e.t, slow: true });
  w.sort((a, b) => a.t0 - b.t0);
  for (let i = 1; i < w.length; i++) if (w[i].t0 < w[i - 1].t1) { if (w[i].slow) w[i - 1].t1 = w[i].t0; else w.splice(i--, 1); }   // çakışan: ayrılma öncelikli
  return w;
}

export function directShot({ met, h, events, maxQ, user = 'auto' }) {
  if (user === 'ground') return { shot: met < -3 ? 'wide' : 'track', mount: null, key: 'u-ground', slow: false };
  if (user === 'chase') return { shot: 'chase', mount: null, key: 'u-chase', slow: false };
  if (user === 'onboard') {
    let mount = null; for (const e of events || []) if (e.cut != null && met >= e.t) mount = e.cut + 12;   // ayrılmadan sonra üst kademede
    return { shot: 'onboard', mount, key: 'u-onboard' + mount, slow: false };
  }
  if (met < -3) return { shot: 'wide', mount: null, key: 'wide', slow: false };
  if (met < 7) return { shot: 'pad', mount: null, key: 'pad', slow: false };
  for (const w of onboardWindows(events, maxQ)) if (met >= w.t0 && met < w.t1) return { shot: 'onboard', mount: w.mount, key: w.key, slow: w.slow };
  if (h < 4.5) return { shot: 'track', mount: null, key: 'track', slow: false };
  return { shot: 'chase', mount: null, key: 'chase', slow: false };
}

// otomatik hız (kullanıcı seçmediyse): kalkış gerçek hızda, ayrılmalar ×2 (yavaş çekim), arada ×10
export const autoWarp = (met, slow) => (met < 20 ? 1 : slow ? 2 : 10);

// kamera sarsıntısı (km): yer kameralarında kalkışın ses basıncı (yakında ve ilk saniyelerde güçlü), araç üstünde dinamik basınç ve motor titreşimi.
// Deterministik (zamana bağlı sinüs toplamı; aynı anda aynı sarsıntı) — 3 eksenli ofset döner.
export function shake(shot, met, { thr = 1, q = 0, dist = 1 } = {}) {
  let a = 0;
  if ((shot === 'pad' || shot === 'track' || shot === 'wide') && met > 0) a = 0.00025 * thr * Math.exp(-met / 9) / Math.max(0.25, dist);
  else if (shot === 'onboard') a = (0.00004 + 0.00012 * Math.min(1, q / 30000)) * thr;
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
