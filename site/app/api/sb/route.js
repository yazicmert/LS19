// /api/sb: katalog sorgularının sunucu ucu (tarayıcı JPL'e doğrudan gitmez: içerik güvenliği politikası yalnız aynı kaynağa izin verir).
//   ?find=apo            → ön ekle arama (en çok 30)
//   ?group=neo&cls=APO&h=22&d=1&sort=H&dir=asc&page=0 → sayfalı liste (50)
// Parametreler beyaz listeden; yanıtlar CDN'de ve Next veri önbelleğinde bir gün tutulur.
import { liveList, liveFind } from '@/lib/sbdb-live';

const CACHE = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' };
export async function GET(req) {
  const u = new URL(req.url), g = (k) => u.searchParams.get(k) || '';
  try {
    if (u.searchParams.has('find')) return Response.json({ rows: await liveFind(g('find')) }, { headers: CACHE });
    const out = await liveList({ group: g('group'), cls: g('cls'), h: g('h'), d: g('d') === '1', sort: g('sort') || 'num', dir: g('dir') === 'desc' ? 'desc' : 'asc', page: +g('page') || 0 });
    return Response.json(out, { headers: CACHE });
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e).slice(0, 120) }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
