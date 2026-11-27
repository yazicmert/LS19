// tüm uydular: CelesTrak etkin kümesinin tamamı (sayı ve kopya zamanı GP kopyasından; okunamazsa haftalık özetteki sayı)
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import SatCatalogBrowser from '@/components/SatCatalogBrowser';
import { pageMeta } from '@/lib/seo';
import { t, num, dateTime } from '@/lib/i18n';
import { satCount } from '@/lib/satcat-live';

export const revalidate = 21600;
export async function generateMetadata({ params }) {
  const { lang } = await params, C = t(lang).satcat;
  return pageMeta(lang, '/satellites/all', { title: C.title, description: C.description });
}
export default async function AllSatellites({ params }) {
  const { lang } = await params, C = t(lang).satcat, { count, copied } = await satCount();
  return (
    <>
      <Masthead lang={lang} current="satellites" altPath="/satellites/all" />
      <main id="main" className="wrap page">
        <h1 className="page__title">{C.title}</h1>
        <p className="page__lead">{C.lead}</p>
        <p className="cat__total mono">{C.total(num(lang, count, 0), copied ? dateTime(lang, copied) : null)}</p>
        <SatCatalogBrowser lang={lang} total={count} />
      </main>
      <Footer lang={lang} />
    </>
  );
}
