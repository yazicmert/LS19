// uydu dizini: yörüngede etkin, gerçek 3B modeli olan uydular
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import SatBrowser from '@/components/SatBrowser';
import { pageMeta } from '@/lib/seo';
import { t, date } from '@/lib/i18n';
import { SATS, SAT_RETRIEVED, satRecord } from '@/lib/satellites';

export async function generateMetadata({ params }) {
  const { lang } = await params, S = t(lang).sat;
  return pageMeta(lang, '/satellites', { title: S.title, description: S.description(SATS.length) });
}
export default async function Satellites({ params }) {
  const { lang } = await params, S = t(lang).sat;
  return (
    <>
      <Masthead lang={lang} current="satellites" altPath="/satellites" />
      <main id="main" className="wrap page">
        <h1 className="page__title">{S.title}</h1>
        <p className="page__lead">{S.lead}</p>
        <SatBrowser lang={lang} rows={SATS.map(satRecord)} />
        <p className="note">{S.homeNote(date(lang, SAT_RETRIEVED))}</p>
      </main>
      <Footer lang={lang} />
    </>
  );
}
