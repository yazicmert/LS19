// Fırlatma hava durumu (Ay görevi › 1. adım): Open-Meteo tahmini (anahtarsız, CORS açık; istek ziyaretçinin tarayıcısından gider) ve
// fırlatma hava kurallarına göre değerlendirme. Değerlendirme saf fonksiyonlardır (Node'da sınanır: test/test_weather.js).
//
// Kurallar NASA'nın Artemis I fırlatma hava kriterlerinden (bilgi notu) ve 45. Hava Filosu'nun fırlatma tahminlerinden; saatlik model verisiyle YAKLAŞIK göstergeler:
//   Yağış:     yağmur altında fırlatılmaz → saatlik yağış ≥ 0,2 mm: uygun değil; yağış olasılığı ≥ %40: riskli
//   Yıldırım:  10 deniz mili içinde yıldırım → bekleme; gök gürültülü fırtına kodu (WMO 95–99): uygun değil; CAPE ≥ 1000 J/kg (konveksiyon, kümülüs/yıldırım göstergesi): riskli
//   Kalkış rüzgârı: Artemis I sınırı 132,5 ft'te 29–39 kt (yöne bağlı) → 120 m rüzgârı ya da 10 m esintisi ≥ 34 kt: uygun değil, ≥ 25 kt: riskli
//   Kalın bulut: donma düzeyine uzanan > 4.500 ft kalın katman kuralı → toplam bulut ≥ %90: riskli (katman kalınlığı modelde yok)
//   Üst seviye rüzgâr kesmesi: 250 hPa rüzgârı ≥ 100 kt: riskli
//   Sıcaklık (kriyojenik yakıt): 24 saat ortalaması 41,4°F (5,2°C) altındaysa yakıt doldurulmaz → 2 m sıcaklığı < 5,2°C: riskli
// Open-Meteo: 16 güne kadar tahmin; geçmiş için past_days ≤ 92 gün.

export const WX_SOURCES = [
  { t: 'NASA — Artemis I fırlatma hava kriterleri (bilgi notu)', u: 'https://www.nasa.gov/wp-content/uploads/2022/03/artemis_i_weather_criteria_fact_sheet_0.pdf' },
  { t: '45. Hava Filosu — fırlatma tahminleri (ör. Falcon 9 Starlink 6-92)', u: 'https://45thweathersquadron.nebula.spaceforce.mil/assets/LaunchForecasts/Falcon%209%20Starlink%206-92%20L-2%20Forecast%20-%207%20Dec%20Launch.pdf' },
  { t: 'Open-Meteo — hava tahmini API', u: 'https://open-meteo.com/en/docs' },
];
export const HOURLY = ['temperature_2m', 'precipitation', 'precipitation_probability', 'weather_code', 'cloud_cover', 'wind_speed_10m', 'wind_gusts_10m', 'wind_speed_120m', 'cape', 'wind_speed_250hPa'];
export const FORECAST_DAYS = 16, PAST_DAYS = 92;
const DAY = 86400000;

// istenen an (ms) için tahmin kapsamı: 'forecast' | 'past' | 'none' (+ neden)
export function coverage(tMs, nowMs = Date.now()) {
  if (tMs > nowMs + FORECAST_DAYS * DAY - 3600000) return { kind: 'none', why: `tahmin en çok ${FORECAST_DAYS} gün ileriyi kapsar` };
  if (tMs < nowMs - PAST_DAYS * DAY) return { kind: 'none', why: `geçmiş veri en çok ${PAST_DAYS} gün geriye gider` };
  return { kind: tMs < nowMs ? 'past' : 'forecast' };
}
export function weatherUrl(lat, lon, tMs, nowMs = Date.now()) {
  const past = tMs < nowMs ? Math.min(PAST_DAYS, Math.ceil((nowMs - tMs) / DAY) + 1) : 0;
  const q = new URLSearchParams({ latitude: lat.toFixed(4), longitude: lon.toFixed(4), hourly: HOURLY.join(','), wind_speed_unit: 'kn', timezone: 'UTC',
    forecast_days: String(FORECAST_DAYS), ...(past ? { past_days: String(past) } : {}) });
  return 'https://api.open-meteo.com/v1/forecast?' + q;
}
// Open-Meteo yanıtında tMs'e en yakın saatin değerleri
export function hourAt(data, tMs) {
  const H = data && data.hourly; if (!H || !H.time || !H.time.length) return null;
  let best = -1, bd = Infinity;
  for (let i = 0; i < H.time.length; i++) { const d = Math.abs(Date.parse(H.time[i] + 'Z') - tMs); if (d < bd) { bd = d; best = i; } }
  if (best < 0 || bd > 3600000) return null;
  const o = { time: H.time[best] };
  for (const k of HOURLY) o[k] = H[k] ? H[k][best] : null;
  // yıldırım için ±1 saat
  o.storm = [best - 1, best, best + 1].some((i) => H.weather_code && H.weather_code[i] >= 95);
  return o;
}
const RANK = { go: 0, risk: 1, nogo: 2, na: -1 };
// bir saatin değerlendirmesi: { status: 'go'|'risk'|'nogo', checks: [{ k, v, st, rule }] }
export function evaluate(h) {
  const c = [], add = (k, v, st, rule) => c.push({ k, v, st, rule });
  const num = (x) => (Number.isFinite(x) ? x : null);
  const pr = num(h.precipitation), pp = num(h.precipitation_probability);
  add('Yağış', pr == null ? '—' : `${pr.toFixed(1)} mm/sa${pp != null ? `, olasılık %${pp}` : ''}`, pr == null ? 'na' : pr >= 0.2 ? 'nogo' : pp != null && pp >= 40 ? 'risk' : 'go', 'Yağmur altında fırlatılmaz');
  const cape = num(h.cape);
  add('Yıldırım', h.storm ? 'gök gürültülü fırtına' : cape == null ? '—' : `CAPE ${Math.round(cape)} J/kg`, h.storm ? 'nogo' : cape == null ? 'na' : cape >= 1000 ? 'risk' : 'go', '10 deniz mili içinde yıldırım: bekleme; CAPE konveksiyon göstergesi');
  const w = num(h.wind_speed_120m), g = num(h.wind_gusts_10m), wmax = Math.max(w ?? -1, g ?? -1);
  add('Kalkış rüzgârı', wmax < 0 ? '—' : `${w != null ? Math.round(w) + ' kt (120 m)' : ''}${w != null && g != null ? ', ' : ''}${g != null ? 'esinti ' + Math.round(g) + ' kt' : ''}`,
    wmax < 0 ? 'na' : wmax >= 34 ? 'nogo' : wmax >= 25 ? 'risk' : 'go', 'Artemis I: 132,5 ft\'te 29–39 kt sınırı');
  const cc = num(h.cloud_cover);
  add('Kalın bulut', cc == null ? '—' : `%${Math.round(cc)} kapalı`, cc == null ? 'na' : cc >= 90 ? 'risk' : 'go', 'Donma düzeyine uzanan > 4.500 ft kalın katmandan geçilmez');
  const up = num(h.wind_speed_250hPa);
  add('Üst seviye rüzgâr', up == null ? '—' : `${Math.round(up)} kt (250 hPa)`, up == null ? 'na' : up >= 100 ? 'risk' : 'go', 'Rüzgâr kesmesi yapıya yük bindirir');
  const T = num(h.temperature_2m);
  add('Sıcaklık', T == null ? '—' : `${T.toFixed(1)} °C`, T == null ? 'na' : T < 5.2 ? 'risk' : 'go', 'Kriyojenik yakıt: 24 sa ortalaması 41,4°F (5,2°C) altındaysa doldurulmaz');
  const status = c.every((x) => x.st === 'na') ? 'na' : c.reduce((s, x) => (RANK[x.st] > RANK[s] ? x.st : s), 'go');   // hiç veri yoksa: veri yok
  return { status, checks: c };
}
// Günlük fırlatma penceresinde önerilen fırsat: önce hava (uygun > riskli; uygun değil önerilmez), sonra en az yakıt, sonra en erken.
// rows: [{ t, cost, wx: { status } }] → { index, why } (index −1: önerilecek fırsat yok)
export function pickLaunch(rows) {
  const ok = rows.map((r, i) => ({ r, i })).filter(({ r }) => r && Number.isFinite(r.cost));
  if (!ok.length) return { index: -1, why: 'fırsat yok' };
  const by = (arr) => arr.sort((a, b) => a.r.cost - b.r.cost || a.r.t - b.r.t)[0].i;
  const go = ok.filter(({ r }) => r.wx && r.wx.status === 'go'), risk = ok.filter(({ r }) => r.wx && r.wx.status === 'risk');
  if (go.length) return { index: by(go), why: 'hava uygun, en az yakıt' };
  if (risk.length) return { index: by(risk), why: 'uygun fırsat yok; riskli olanlar arasında en az yakıt' };
  if (ok.every(({ r }) => !r.wx || r.wx.status === 'na')) return { index: by(ok), why: 'hava verisi yok; en az yakıt' };
  return { index: -1, why: 'günün bütün fırsatlarında hava uygun değil: sonraki pencereyi deneyin' };
}
export const STATUS_TR = { go: 'Uygun', risk: 'Riskli', nogo: 'Uygun değil', na: 'Veri yok' };

// tarayıcı: rampa + an için değerlendirme (aynı rampa/gün için bellek önbelleği). Dönüş: { status, checks, time, kind } | { status: 'na', why }
const cache = new Map();
export async function launchWeather(lat, lon, tMs, { nowMs = Date.now(), fetchFn = (u) => fetch(u) } = {}) {
  const cov = coverage(tMs, nowMs);
  if (cov.kind === 'none') return { status: 'na', why: cov.why };
  const url = weatherUrl(lat, lon, tMs, nowMs), key = url.replace(/past_days=\d+/, '') + '|' + Math.floor(nowMs / 3600000);
  let p = cache.get(key);
  if (!p) { p = fetchFn(url).then(async (r) => { const j = await r.json(); if (!r.ok || j.error) throw new Error(j.reason || 'HTTP ' + r.status); return j; }); cache.set(key, p); p.catch(() => cache.delete(key)); }
  let data; try { data = await p; } catch (e) { return { status: 'na', why: 'Open-Meteo: ' + String(e.message || e).slice(0, 80) }; }
  const h = hourAt(data, tMs); if (!h) return { status: 'na', why: 'bu saat için veri yok' };
  return { ...evaluate(h), time: h.time, kind: cov.kind };
}
