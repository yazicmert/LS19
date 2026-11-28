// uydu dizini: yörüngede etkin, gerçek 3B modeli olan uydular; üstte tüm uydular kataloğuna bağlantı (etkin küme sayısıyla)
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import SatBrowser from '@/components/SatBrowser';
import { pageMeta } from '@/lib/seo';
import { t, date, num } from '@/lib/i18n';
import { satCount } from '@/lib/satcat-live';
import { ArrowRight } from '@/components/Icon';
import { SATS, SAT_RETRIEVED, satRecord } from '@/lib/satellites';

export async function generateMetadata({ params }) {
  const { lang } = await params, S = t(lang).sat;
  return pageMeta(lang, '/satellites', { title: S.title, description: S.description(SATS.length) });
}
export default async function Satellites({ params }) {
  const { lang } = await params, L = t(lang), S = L.sat, { count } = await satCount();
  return (
    <>
      <Masthead lang={lang} current="satellites" altPath="/satellites" />
      <main id="main" className="wrap page">
        <h1 className="page__title">{S.title}</h1>
        <p className="page__lead">{S.lead}</p>
        <p className="cat__banner">{L.satcat.banner(SATS.length, num(lang, count, 0))} <Link className="lnk" href={`/${lang}/satellites/all`}>{L.satcat.bannerLink}<ArrowRight /></Link></p>
        <SatBrowser lang={lang} rows={SATS.map(satRecord)} />
        <p className="note">{S.homeNote(date(lang, SAT_RETRIEVED))}</p>
      </main>
      <Footer lang={lang} />
    </>
  );
}
