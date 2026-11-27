// tüm asteroitler: JPL SBDB kataloğunun tamamı ve "Asteroitler hakkında" (sayılar günde bir JPL'den; alınamazsa son bilinen değerler)
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import CatalogBrowser from '@/components/CatalogBrowser';
import { pageMeta } from '@/lib/seo';
import { t, num } from '@/lib/i18n';
import { OBJECTS } from '@/lib/asteroids';
import AsteroidPrimer, { PrimerStats } from '@/components/AsteroidPrimer';
import MISSIONS from '@/data/missions.json';
import { catalogStats } from '@/lib/sbdb-live';
import { visitedDes } from '@/lib/missions';

export const revalidate = 86400;
export async function generateMetadata({ params }) {
  const { lang } = await params, C = t(lang).cat;
  return pageMeta(lang, '/asteroids/all', { title: C.title, description: C.description });
}
export default async function AllAsteroids({ params }) {
  const { lang } = await params, C = t(lang).cat, stats = await catalogStats(), total = stats.total;
  const shapeIds = Object.fromEntries(OBJECTS.map((o) => [o.des, o.id]));
  return (
    <>
      <Masthead lang={lang} current="asteroids" altPath="/asteroids/all" />
      <main id="main" className="wrap page">
        <h1 className="page__title">{C.title}</h1>
        <p className="page__lead">{C.lead}</p>
        <p className="cat__total mono">{C.total(num(lang, total, 0))} · <a href="#pr-h">{t(lang).pr.title}</a></p>
        <PrimerStats lang={lang} stats={stats} />
        <CatalogBrowser lang={lang} total={total} shapeIds={shapeIds} visited={Object.fromEntries(visitedDes(MISSIONS).map((d) => [d, 1]))} />
        <AsteroidPrimer lang={lang} stats={stats} missions={MISSIONS} shapeIds={shapeIds} />
      </main>
      <Footer lang={lang} />
    </>
  );
}
