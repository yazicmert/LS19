// /api/gp?group=active — CelesTrak GP (OMM JSON). CelesTrak kuralı: aynı grup 2 saatten sık indirilmez -> CDN 2 sa tutar.
// CelesTrak bulut IP'sini engellerse GitHub "data" dalındaki 2 saatlik kopyaya düşer (yalnız "active" grubu).
import { send, fail, getText, celestrakOrMirror, PERIODS } from './_lib.js';
const GROUPS = new Set(['active', 'stations', 'starlink', 'gps-ops', 'glo-ops', 'galileo', 'beidou', 'geo', 'weather', 'science', 'oneweb', 'last-30-days']);
export async function GET(req) {
  const group = new URL(req.url).searchParams.get('group') || 'active';
  if (!GROUPS.has(group)) return fail('bilinmeyen grup', 400);
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`;
  try {
    const r = group === 'active' ? await celestrakOrMirror(url, 'gp_active.json') : { txt: await getText(url, { tries: 2 }), kaynak: 'CelesTrak', yas: 0 };
    return send(r.txt, { sMaxAge: PERIODS.gp, swr: 6 * PERIODS.gp, headers: { 'X-LS19-Kaynak': encodeURIComponent(r.kaynak), 'X-LS19-Yas': String(r.yas) } });
  } catch (e) { return fail('CelesTrak verisi alınamadı: ' + String(e.message || e).slice(0, 160)); }
}
