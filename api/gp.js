// /api/gp?group=active — CelesTrak GP (OMM JSON). CelesTrak kuralı: aynı grup 2 saatten sık indirilmez -> CDN 2 sa tutar.
import { send, fail, getText, PERIODS } from './_lib.js';
const GROUPS = new Set(['active', 'stations', 'starlink', 'gps-ops', 'glo-ops', 'galileo', 'beidou', 'geo', 'weather', 'science', 'oneweb', 'last-30-days']);
export async function GET(req) {
  const group = new URL(req.url).searchParams.get('group') || 'active';
  if (!GROUPS.has(group)) return fail('bilinmeyen grup', 400);
  try {
    const txt = await getText(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`, { tries: 2 });
    const arr = JSON.parse(txt);
    if (!Array.isArray(arr) || !arr.length) throw new Error('beklenmeyen yanıt');
    return send(txt, { sMaxAge: PERIODS.gp, swr: 6 * PERIODS.gp, headers: { 'X-LS19-Kaynak': encodeURIComponent('CelesTrak'), 'X-LS19-Yas': '0' } });
  } catch (e) { return fail('CelesTrak verisi alınamadı: ' + String(e.message || e).slice(0, 160)); }
}
