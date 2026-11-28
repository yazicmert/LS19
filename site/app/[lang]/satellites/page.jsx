// uydular: CelesTrak etkin kümesinin tamamı tek listede (arama, yörünge/ülke/işletmeci/program süzgeçleri, sıralama); "3B modeli olan"
// süzgeci NASA modeli olan uyduları gösterir, onların satırı zengin sayfaya açılır. Sayı ve kopya zamanı GP kopyasından; okunamazsa özetteki sayı.
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import SatCatalogBrowser from '@/components/SatCatalogBrowser';
import { pageMeta } from '@/lib/seo';
import { t, num, dateTime, date } from '@/lib/i18n';
import { satCount } from '@/lib/satcat-live';
import { SATS, SAT_RETRIEVED } from '@/lib/satellites';
import { ArrowRight } from '@/components/Icon';

export const revalidate = 21600;
export async function generateMetadata({ params }) {
  const { lang } = await params, C = t(lang).satcat;
  return pageMeta(lang, '/satellites', { title: t(lang).nav.satellites, description: C.description });
}
export default async function Satellites({ params }) {
  const { lang } = await params, L = t(lang), C = L.satcat, { count, copied } = await satCount();
  return (
    <>
      <Masthead lang={lang} current="satellites" altPath="/satellites" />
      <main id="main" className="wrap page">
        <h1 className="page__title">{L.nav.satellites}</h1>
        <p className="page__lead">{C.lead} {C.m3dLead(SATS.length)}</p>
        <p className="cat__total mono">{C.total(num(lang, count, 0), copied ? dateTime(lang, copied) : null)}</p>
        <p className="cat__banner"><Link className="lnk" href={`/${lang}/satellites/stats`}>{L.sst.homeLink}<ArrowRight /></Link></p>
        <SatCatalogBrowser lang={lang} total={count} />
        <p className="note">{L.sat.homeNote(date(lang, SAT_RETRIEVED))}</p>
      </main>
      <Footer lang={lang} />
    </>
  );
}
