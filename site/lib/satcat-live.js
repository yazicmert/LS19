// Tüm uydular kataloğu, sunucu tarafı: yörüngeler LS19'un "data" dalındaki CelesTrak GP kopyasından (etkin uydular, 2 saatte bir
// yenilenir; .github/workflows/celestrak-data.yml), uydu ve fırlatma bilgisi haftalık GCAT özetinden (data/satcat.json).
// GP dosyası ~7 MB: Next veri önbelleğine sığmaz (2 MB sınırı), bu yüzden süreç belleğinde tutulur (bir saat; yenilenemezse eskisi
// sunulur). Sayfalar ve /api/sat yanıtları ayrıca ISR ve CDN önbelleğinde kalır. Tarayıcı bu modülü hiç almaz.
import CAT from '../data/satcat.json';
import { SATS } from './satellites.js';
import { buildIndex, satRecordOf, queryCat, catFacets, findCat, parseCatQuery } from './satcat.js';

export const GP_BASE = 'https://raw.githubusercontent.com/yazicmert/LS19/data';
export const CAT_INFO = { retrieved: CAT.retrieved, gp: CAT.gp, gcat: CAT.gcat };
const UA = { 'User-Agent': 'lookstar19/0.2 (non-commercial space library; +https://github.com/yazicmert/LS19)' };
const TTL = 3600_000, MODEL_IDS = new Set(SATS.map((s) => s.id));
let cur = null, inflight = null;

async function getJson(url, timeout) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`GP ${r.status}`);
  return r.json();
}
async function load() {
  const [gp, meta] = await Promise.all([getJson(`${GP_BASE}/gp_active.json`, 30_000), getJson(`${GP_BASE}/meta.json`, 10_000).catch(() => null)]);
  if (!Array.isArray(gp) || gp.length < 5000) throw new Error('GP verisi beklenmeyen biçimde');
  return { t: Date.now(), copied: meta && Number.isFinite(meta.t) ? new Date(meta.t).toISOString() : null, index: buildIndex(gp, CAT, MODEL_IDS) };
}
const refresh = () => (inflight ||= load().then((x) => { cur = x; return x; }).finally(() => { inflight = null; }));
// dizin: taze kopya bellekteyse o; eskimişse eskisi hemen sunulur, arkada yenilenir; hiç yoksa beklenir (hata yukarı gider)
export async function gpIndex() {
  if (cur && Date.now() - cur.t < TTL) return cur;
  if (cur) { refresh().catch(() => {}); return cur; }
  return refresh();
}
// tek uydu (etkin kümede yoksa null)
export async function liveSat(norad) {
  const x = await gpIndex(), s = satRecordOf(x.index, norad);
  return s ? { s, copied: x.copied } : null;
}
// katalog sorgusu (adres parametreleri beyaz listeden); facets: süzgeç seçenekleri de istenirse
export async function liveCatalog(get, facets = false) {
  const x = await gpIndex();
  return { ...queryCat(x.index, parseCatQuery(get)), copied: x.copied, ...(facets ? { facets: catFacets(x.index) } : {}) };
}
export async function liveFindSat(q) { return findCat((await gpIndex()).index, q, 8); }
// etkin uydu sayısı ve kopya zamanı; kopya okunamazsa haftalık özetteki sayı
export async function satCount() {
  try { const x = await gpIndex(); return { count: x.index.rows.length, copied: x.copied }; } catch { return { count: CAT.gp.count, copied: null }; }
}
