// /api/supgp?file=iss — CelesTrak Supplemental GP (operatörlerin kendi yörünge çözümleri: ISS, Starlink, OneWeb, GPS…).
// Normal GP'den daha doğru (manevralar daha hızlı yansır). CelesTrak kuralı gereği 2 sa önbellek; engellenirse GitHub kopyası.
import { send, fail, celestrakOrMirror, SUP_FILES, PERIODS } from './_lib.js';
export async function GET(req) {
  const f = new URL(req.url).searchParams.get('file') || '';
  if (!SUP_FILES.has(f)) return fail('bilinmeyen dosya', 400);
  try {
    const r = await celestrakOrMirror(`https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=${encodeURIComponent(f)}&FORMAT=json`, `sup_${f}.json`);
    return send(r.txt, { sMaxAge: PERIODS.gp, swr: 6 * PERIODS.gp, headers: { 'X-LS19-Kaynak': encodeURIComponent('SupGP · ' + r.kaynak), 'X-LS19-Yas': String(r.yas) } });
  } catch (e) { return fail('SupGP verisi alınamadı: ' + String(e.message || e).slice(0, 160)); }
}
