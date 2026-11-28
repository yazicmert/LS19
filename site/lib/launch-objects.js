// fırlatıldıktan sonra yörüngedeki nesneler (yalnız sunucuda): CelesTrak GP "active" grubu, LS19'un 2 saatte bir güncellenen kopyasından
// (depo "data" dalı; .github/workflows/celestrak-data.yml). CelesTrak bulut sağlayıcıların IP'lerini engelleyebildiği için doğrudan sorulmaz.
// Dosya ~7 MB: Next veri önbelleğinin 2 MB sınırını aştığı için fetch yerine node:https ile okunur; yalnız fırlatılmış (uluslararası
// tanıtıcısı olan) bir fırlatmanın sayfası üretilirken çağrılır ve sayfa ISR ile 30 dakika önbellekte kalır. Hata olursa null (blok "alınamadı" der).
import https from 'node:https';
import { launchObjects } from './launch-detail.js';

const BASE = 'https://raw.githubusercontent.com/yazicmert/LS19/data';
export const GP_COPY_URL = `${BASE}/gp_active.json`;
const UA = { 'User-Agent': 'lookstar19/0.2 (non-commercial space library; +https://github.com/yazicmert/LS19)' };

function getText(url, timeout = 20_000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: UA, timeout }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      res.setEncoding('utf8'); let d = '';
      res.on('data', (c) => { d += c; if (d.length > 40e6) req.destroy(new Error('too large')); });
      res.on('end', () => resolve(d));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
// { objects, copied } | null
export async function objectsForLaunch(designator) {
  if (!/^\d{4}-\d{3}$/.test(String(designator || ''))) return null;
  try {
    const [gp, meta] = await Promise.all([getText(GP_COPY_URL).then(JSON.parse), getText(`${BASE}/meta.json`, 8000).then(JSON.parse).catch(() => null)]);
    return { objects: launchObjects(gp, designator), copied: meta && Number.isFinite(meta.t) ? new Date(meta.t).toISOString() : null };
  } catch (e) {
    console.warn(`lookstar19: CelesTrak GP kopyası alınamadı (${String((e && e.message) || e).slice(0, 60)})`);
    return null;
  }
}
