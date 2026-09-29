// /api/asteroids?set=neo|mb — JPL SBDB: Dünya'ya yakın asteroitler / ana kuşak (H<13,5) + Jüpiter Truvalıları (H<13), sütunlu
import { send, fail, getJson, compactSbdb, SB_FIELDS, SBQ, PERIODS } from './_lib.js';
export const config = { maxDuration: 60 };
export async function GET(req) {
  const set = new URL(req.url).searchParams.get('set') || 'neo';
  if (!['neo', 'mb'].includes(set)) return fail('bilinmeyen küme', 400);
  const q = (p) => getJson(SBQ + new URLSearchParams({ fields: SB_FIELDS, 'sb-kind': 'a', 'full-prec': '1', ...p }), { timeoutMs: 55000 });
  try {
    const parts = set === 'neo' ? [await q({ 'sb-group': 'neo' })]
      : await Promise.all([q({ 'sb-class': 'IMB,MBA,OMB,MCA', 'sb-cdata': JSON.stringify({ AND: ['H|LT|13.5'] }) }),
        q({ 'sb-class': 'TJN', 'sb-cdata': JSON.stringify({ AND: ['H|LT|13'] }) })]);
    const cols = compactSbdb(parts);
    if (cols.a.length < 100) throw new Error('SBDB yanıtı eksik');
    const body = { set, aciklama: set === 'neo' ? "Dünya'ya yakın asteroitler (tümü)" : 'Ana kuşak (H<13,5) + Jüpiter Truvalıları (H<13)',
      kaynak: 'JPL SBDB', t: Date.now(), n: cols.a.length, cols };
    return send(body, { sMaxAge: PERIODS[set], swr: 7 * PERIODS[set] });
  } catch (e) { return fail('JPL SBDB verisi alınamadı: ' + String(e.message || e).slice(0, 160)); }
}
