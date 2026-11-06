// Fırlatma kataloğu (saf; tarayıcı, bulut vekili api/launches.js ve Node testleri): yaklaşan ve son fırlatmaları tek, küçük biçime çevirir.
// Yerel sunucudaki karşılığı sunucu.py compact_ll2 / compact_rll (aynı çıktı: test/test_api.js).
// Kaynaklar (ikisi de ücretsiz, anahtarsız):
//   • The Space Devs — Launch Library 2 (ll.thespacedevs.com): tüm veritabanı ücretsiz; anahtarsız IP başına saatte 15 istek. CORS açık,
//     bu yüzden vekil yoksa ya da sınıra takıldıysa tarayıcı doğrudan sorabilir. Yaklaşan ve geçmiş fırlatmalar, COSPAR kodu (uydu kataloğu bağı).
//   • RocketLaunch.Live ücretsiz akışı (fdo.rocketlaunch.live): yalnız sonraki 5 fırlatma, CORS yok (yalnız vekilden). LL2 alınamazsa yedek.
//     Koşulu: verinin yanında "Data by RocketLaunch.Live" yazılır.

export const LL2_BASE = 'https://ll.thespacedevs.com/2.3.0/';
export const LL2_UPCOMING = LL2_BASE + 'launches/upcoming/?limit=30&mode=normal&hide_recent_previous=true';
export const LL2_PREVIOUS = LL2_BASE + 'launches/previous/?limit=20&mode=normal';
export const RLL_NEXT = 'https://fdo.rocketlaunch.live/json/launches/next/5';
// yenileme aralığı: LL2'nin saatte 15 isteği içinde (her yenileme 2 istek) ve yaklaşan fırlatmaların durumu (erteleme, bekleme) için yeterince sık
export const LAUNCH_PERIOD_S = 1800;
export const CREDITS = {
  ll2: { t: 'The Space Devs — Launch Library 2 (ücretsiz, anahtarsız)', u: 'https://thespacedevs.com/llapi' },
  rll: { t: 'Data by RocketLaunch.Live', u: 'https://www.rocketlaunch.live' },
};

// LL2 fırlatma durumu (status.id) -> kod
const STATUS = { 1: 'go', 2: 'tbd', 3: 'basarili', 4: 'basarisiz', 5: 'bekleme', 6: 'ucusta', 7: 'kismi', 8: 'tbc' };
export const DONE = new Set(['basarili', 'basarisiz', 'kismi']);
// T-0 kesinliği, kabadan inceye sıralı ölçek (sayı küçüldükçe kesin): LL2 net_precision.id ->
//   0 saniye, 1 dakika, 2 saat, 3 sabah / 4 öğleden sonra / 5 gün, 6 hafta, 7 ay, 8–11 çeyrek, 12–13 yarıyıl, 14+ yıl
// (kısaltmaya güvenilmez: "M" ay demektir, dakika "MIN")
export const PREC = ['sn', 'dk', 'sa', 'gun', 'hafta', 'ay', 'ceyrek', 'yariyil', 'yil'];
function precLL2(np) {
  const id = np && Number.isFinite(+np.id) ? +np.id : null;
  if (id === null) return null;
  return id <= 0 ? 'sn' : id === 1 ? 'dk' : id === 2 ? 'sa' : id <= 5 ? 'gun' : id === 6 ? 'hafta' : id === 7 ? 'ay' : id <= 11 ? 'ceyrek' : id <= 13 ? 'yariyil' : 'yil';
}
export const precRank = (p) => { const i = PREC.indexOf(p); return i < 0 ? PREC.indexOf('gun') : i; };

const ms = (s) => { if (!s) return null; const v = Date.parse(s); return Number.isFinite(v) ? v : null; };
const str = (x) => (typeof x === 'string' && x.trim() ? x.trim() : null);
const num = (x) => { if (x === null || x === undefined || x === '') return null; const v = Number(x); return Number.isFinite(v) ? Math.round(v * 1e5) / 1e5 : null; };

// LL2 (mode=normal) kaydı -> küçük kayıt
export function fromLL2(r) {
  if (!r || !r.id) return null;
  const net = ms(r.net);
  if (net === null) return null;
  const mi = r.mission || {}, pad = r.pad || {}, loc = pad.location || {}, cfg = (r.rocket && r.rocket.configuration) || {}, lsp = r.launch_service_provider || {};
  const parts = String(r.name || '').split('|').map((x) => x.trim());
  const durum = STATUS[r.status && r.status.id] || 'tbd';
  const orbit = mi.orbit && str(mi.orbit.abbrev);
  return {
    id: String(r.id),
    gorev: str(mi.name) || parts[1] || str(r.name) || '?',
    roket: str(cfg.full_name) || str(cfg.name) || parts[0] || '?',
    saglayici: str(lsp.name),
    durum,
    net,
    kesinlik: precLL2(r.net_precision) || (DONE.has(durum) ? 'dk' : 'gun'),
    pencere: ms(r.window_start) !== null && ms(r.window_end) !== null ? [ms(r.window_start), ms(r.window_end)] : null,
    rampa: str(pad.name),
    rampaId: Number.isFinite(+pad.id) && pad.id !== null ? +pad.id : null,
    yer: str(loc.name),
    ulke: (pad.country && str(pad.country.alpha_2_code)) || null,
    enlem: num(pad.latitude),
    boylam: num(pad.longitude),
    yorunge: orbit && orbit !== 'N/A' ? orbit : null,
    cospar: str(r.launch_designator),
    canli: r.webcast_live === true,
  };
}

// RocketLaunch.Live ücretsiz akış kaydı -> küçük kayıt (durum ve kesinlik daha kaba: akış onay durumu vermez)
export function fromRLL(r) {
  if (!r || r.id === undefined || r.id === null) return null;
  const t0 = ms(r.t0), wo = ms(r.win_open), wc = ms(r.win_close), sd = Number(r.sort_date);
  const net = t0 ?? wo ?? (Number.isFinite(sd) && sd > 0 ? sd * 1000 : null);
  if (net === null) return null;
  const e = r.est_date || {};
  const kesinlik = t0 !== null || wo !== null ? 'dk' : e.day ? 'gun' : e.month ? 'ay' : e.quarter ? 'ceyrek' : 'yil';
  const pad = r.pad || {}, loc = pad.location || {}, mi = (r.missions && r.missions[0]) || {};
  const res = r.result === null || r.result === undefined || r.result === '' ? NaN : Number(r.result);     // Number(null) = 0 olurdu (başarısız)
  const durum = res === 1 ? 'basarili' : res === 0 ? 'basarisiz' : res === 2 ? 'kismi' : 'tbd';
  const mission = str(r.name) && str(r.name) !== 'TBD' ? str(r.name) : str(mi.name);
  return {
    id: 'rll-' + r.id,
    gorev: mission || '?',
    roket: (r.vehicle && str(r.vehicle.name)) || '?',
    saglayici: (r.provider && str(r.provider.name)) || null,
    durum,
    net,
    kesinlik,
    pencere: wo !== null && wc !== null ? [wo, wc] : null,
    rampa: str(pad.name),
    rampaId: null,
    yer: [str(loc.name), str(loc.statename) || str(loc.state), str(loc.country)].filter(Boolean).join(', ') || null,
    ulke: null,
    enlem: null,
    boylam: null,
    yorunge: null,
    cospar: str(r.cospar_id),
    canli: false,
  };
}

// kaynak yanıtlarından katalog: { kod, kaynak, t, yaklasan: [...] (artan), gecmis: [...] (azalan) }
export function buildCatalog(kod, upcoming, previous, t = Date.now()) {
  const conv = kod === 'rll' ? fromRLL : fromLL2;
  const up = (upcoming || []).map(conv).filter(Boolean).sort((a, b) => a.net - b.net);
  const prev = (previous || []).map(conv).filter(Boolean).sort((a, b) => b.net - a.net);
  return { kod, kaynak: CREDITS[kod].t, t, yaklasan: up, gecmis: prev };
}

// ana ekrandaki takvim: henüz kalkmamış ya da az önce (≤ 1 sa) kalkmış görünenler, zaman sırasıyla
export function nextLaunches(cat, now = Date.now(), n = 3) {
  if (!cat) return [];
  return cat.yaklasan.filter((l) => !DONE.has(l.durum) && (l.net >= now - 3600e3 || l.durum === 'ucusta')).slice(0, n);
}

// geri sayım metni için: T− / T+ ve kalan süre; kesinlik günden kabaysa geri sayım yok (yalnız tarih)
export function countdown(l, now = Date.now()) {
  if (precRank(l.kesinlik) > precRank('sa')) return null;
  const d = l.net - now;
  return { isaret: d >= 0 ? '−' : '+', s: Math.floor(Math.abs(d) / 1000), yaklasik: l.kesinlik === 'sa' };
}

// COSPAR fırlatma kodu (ör. "2026-246") -> uydu kataloğunda o fırlatmanın nesneleri (OBJECT_ID "2026-246A", "2026-246B", …)
export function catalogObjects(cospar, omm) {
  if (!cospar || !omm) return [];
  const c = cospar.trim(), n = c.length, out = [];
  for (const o of omm) {
    const id = o.OBJECT_ID || '';
    if (id.length > n && id.startsWith(c) && /[A-Z]/.test(id[n])) out.push({ id: +o.NORAD_CAT_ID, ad: o.OBJECT_NAME, parca: id });
  }
  return out.sort((a, b) => (a.parca.length - b.parca.length) || (a.parca < b.parca ? -1 : a.parca > b.parca ? 1 : 0));
}
