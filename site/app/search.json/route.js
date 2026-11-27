// /search.json: site aramasının dizini (derlemede bir kez üretilir, statik). Asteroitler ve uydular; sayfa adları istemcide i18n'den.
import { OBJECTS } from '@/lib/asteroids';
import { SATS } from '@/lib/satellites';
import { shortName } from '@/lib/asteroids-match';

export const dynamic = 'force-static';
export function GET() {
  const body = {
    ast: OBJECTS.map((o) => ({ id: o.id, n: shortName(o), d: o.des, f: o.fullname, k: o.number, c: o.orbitClass.code, cn: o.orbitClass.name, pha: o.pha })),
    sat: SATS.map((s) => ({ id: s.id, en: s.title.en, tr: s.title.tr, g: s.name, k: s.norad, c: s.cospar, o: s.gcat ? s.gcat.ownerShort : [], r: s.derived.regime })),
  };
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } });
}
