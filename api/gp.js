// /api/gp?group=active — CelesTrak GP (OMM JSON). CelesTrak kuralı: aynı grup 2 saatten sık indirilmez -> CDN 2 sa tutar.
// CelesTrak bulut IP'sini engellerse GitHub "data" dalındaki 2 saatlik kopyaya düşer (yalnız "active" grubu).
// /api/gp?catnr=5 — tek uydu (NORAD): etkin listede olmayan, görevi bitmiş ama yörüngedeki yükler (Fırlatmalar > yükler > 3B'de izle).
// CelesTrak kaydı yoksa (atmosfere girmiş ya da izlenmiyor) 404.
// &fmt=col: liste sütunlu biçimde ({ n, cols }, _lib.js ommColumns; ~%30 küçük). Varsayılan OMM dizisi kalır (dağıtım sırasında açık eski sekmeler bozulmasın).
import { send, fail, getText, celestrakOrMirror, ommColumns, PERIODS } from './_lib.js';
const GROUPS = new Set(['active', 'stations', 'starlink', 'gps-ops', 'glo-ops', 'galileo', 'beidou', 'geo', 'weather', 'science', 'oneweb', 'last-30-days']);
export async function GET(req) {
  const q = new URL(req.url).searchParams;
  if (q.has('catnr')) return one(q.get('catnr'));
  const group = q.get('group') || 'active';
  if (!GROUPS.has(group)) return fail('bilinmeyen grup', 400);
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=json`;
  try {
    const r = group === 'active' ? await celestrakOrMirror(url, 'gp_active.json') : { txt: await getText(url, { tries: 2 }), kaynak: 'CelesTrak', yas: 0 };
    let body = r.txt;
    if (q.get('fmt') === 'col') { const arr = JSON.parse(r.txt); if (!Array.isArray(arr) || !arr.length) throw new Error('beklenmeyen yanıt'); body = JSON.stringify(ommColumns(arr)); }
    return send(body, { sMaxAge: PERIODS.gp, swr: 6 * PERIODS.gp, headers: { 'X-LS19-Kaynak': encodeURIComponent(r.kaynak), 'X-LS19-Yas': String(r.yas) } });
  } catch (e) { return fail('CelesTrak verisi alınamadı: ' + String(e.message || e).slice(0, 160)); }
}
async function one(s) {
  if (!/^\d{1,6}$/.test(s || '') || +s < 1) return fail('geçersiz NORAD numarası', 400);
  const n = +s;
  let txt;
  try { txt = await getText(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${n}&FORMAT=json`, { tries: 2, timeoutMs: 20000 }); }
  catch (e) { return fail('CelesTrak verisi alınamadı: ' + String(e.message || e).slice(0, 160)); }
  let arr = null; try { arr = JSON.parse(txt); } catch (e) { /* "No GP data found" düz metni */ }
  if (!Array.isArray(arr) || !arr.some((o) => +o.NORAD_CAT_ID === n)) return send(JSON.stringify({ hata: 'güncel yörünge verisi yok' }), { status: 404, sMaxAge: PERIODS.gp });
  return send(txt, { sMaxAge: PERIODS.gp, swr: 6 * PERIODS.gp, headers: { 'X-LS19-Kaynak': 'CelesTrak', 'X-LS19-Yas': '0' } });
}
