// asteroitler: JPL SBDB kataloğunun tamamı tek listede (ad/numara araması, süzgeçler, sıralama); "3B şekil modeli olan" süzgeci gerçek
// şekil modeli olan cisimleri gösterir (yerel veri). Altta "Asteroitler hakkında" (sayılar günde bir JPL'den; alınamazsa son bilinen değerler).
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import CatalogBrowser from '@/components/CatalogBrowser';
import AsteroidPrimer, { PrimerStats } from '@/components/AsteroidPrimer';
import MISSIONS from '@/data/missions.json';
import { pageMeta } from '@/lib/seo';
import { t, num, date } from '@/lib/i18n';
import { OBJECTS, RETRIEVED } from '@/lib/asteroids';
import { catalogStats } from '@/lib/sbdb-live';
import { visitedDes } from '@/lib/missions';

export const revalidate = 86400;
export async function generateMetadata({ params }) {
  const { lang } = await params, C = t(lang).cat;
  return pageMeta(lang, '/asteroids', { title: t(lang).nav.asteroids, description: C.description });
}
// şekil modelli cisimler, katalog satırı biçiminde (JPL listesiyle aynı sütunlar)
const shapeRow = (o) => ({
  spk: o.number ?? 1e9 + (o.des.length || 0), des: o.des, name: o.name && o.name !== o.des ? o.name : null, full: o.fullname, number: o.number ?? null, neo: !!o.neo, pha: !!o.pha,
  cls: o.orbitClass.code, H: o.phys.H ?? null, D: o.phys.diameter ?? null, a: o.elements.a ?? null, e: o.elements.e ?? null, i: o.elements.i ?? null, moid: o.moid ?? null, first: (o.solution && o.solution.first) || null,
});
export default async function Asteroids({ params }) {
  const { lang } = await params, L = t(lang), C = L.cat, stats = await catalogStats(), total = stats.total;
  const shapeIds = Object.fromEntries(OBJECTS.map((o) => [o.des, o.id]));
  return (
    <>
      <Masthead lang={lang} current="asteroids" altPath="/asteroids" />
      <main id="main" className="wrap page">
        <h1 className="page__title">{L.nav.asteroids}</h1>
        <p className="page__lead">{C.lead} {C.m3dLead(OBJECTS.length)}</p>
        <p className="cat__total mono">{C.total(num(lang, total, 0))} · <a href="#pr-h">{L.pr.title}</a></p>
        <PrimerStats lang={lang} stats={stats} />
        <CatalogBrowser lang={lang} total={total} shapeIds={shapeIds} shapeRows={OBJECTS.map(shapeRow)} visited={Object.fromEntries(visitedDes(MISSIONS).map((d) => [d, 1]))} />
        <p className="note">{L.home.modelsNote(date(lang, RETRIEVED))}</p>
        <AsteroidPrimer lang={lang} stats={stats} missions={MISSIONS} shapeIds={shapeIds} />
      </main>
      <Footer lang={lang} />
    </>
  );
}
