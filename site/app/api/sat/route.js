// /api/sat: tüm uydular kataloğunun sunucu ucu (tarayıcı dış kaynağa gitmez: içerik güvenliği politikası yalnız aynı kaynağa izin verir).
//   ?find=iss            → site araması (en çok 8: tam NORAD, sonra başlayan, sonra içeren)
//   ?q=starlink&regime=LEO&state=US&owner=SPXS&prog=Starlink&sso=1&model=1&sort=alt&dir=desc&page=2&f=1 → sayfalı liste (50); f=1 süzgeç seçenekleri
// Parametreler beyaz listeden (lib/satcat.js parseCatQuery); süzme ve sıralama sunucu belleğindeki dizinde. Yanıtlar CDN'de yarım saat tutulur
// (GP kopyası 2 saatte bir yenilenir).
import { liveCatalog, liveFindSat } from '@/lib/satcat-live';

const CACHE = { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400' };
export async function GET(req) {
  const u = new URL(req.url), sp = u.searchParams;
  try {
    if (sp.has('find')) return Response.json({ rows: await liveFindSat(sp.get('find')) }, { headers: CACHE });
    return Response.json(await liveCatalog((k) => sp.get(k), sp.get('f') === '1'), { headers: CACHE });
  } catch (e) {
    return Response.json({ error: String((e && e.message) || e).slice(0, 120) }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
