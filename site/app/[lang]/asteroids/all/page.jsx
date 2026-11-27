// tüm asteroitler: JPL SBDB kataloğunun tamamı (sayı derlemede JPL'den alınır; alınamazsa son bilinen değer)
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import CatalogBrowser from '@/components/CatalogBrowser';
import { pageMeta } from '@/lib/seo';
import { t, num } from '@/lib/i18n';
import { OBJECTS } from '@/lib/asteroids';
import { catalogCount } from '@/lib/sbdb-live';

export const revalidate = 86400;
export async function generateMetadata({ params }) {
  const { lang } = await params, C = t(lang).cat;
  return pageMeta(lang, '/asteroids/all', { title: C.title, description: C.description });
}
export default async function AllAsteroids({ params }) {
  const { lang } = await params, C = t(lang).cat, total = await catalogCount();
  return (
    <>
      <Masthead lang={lang} current="asteroids" altPath="/asteroids/all" />
      <main id="main" className="wrap page">
        <h1 className="page__title">{C.title}</h1>
        <p className="page__lead">{C.lead}</p>
        <p className="cat__total mono">{C.total(num(lang, total, 0))}</p>
        <CatalogBrowser lang={lang} total={total} shapeIds={Object.fromEntries(OBJECTS.map((o) => [o.des, o.id]))} />
      </main>
      <Footer lang={lang} />
    </>
  );
}
