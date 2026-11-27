// roket dizini: 2020'den bu yana yörüngeye ulaşmış fırlatma araçları (GCAT)
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import RocketBrowser from '@/components/RocketBrowser';
import { pageMeta } from '@/lib/seo';
import { t } from '@/lib/i18n';
import { ROCKETS, RK_UPDATED, rocketRecord } from '@/lib/rockets';

export async function generateMetadata({ params }) {
  const { lang } = await params, R = t(lang).rk;
  return pageMeta(lang, '/rockets', { title: R.title, description: R.description(ROCKETS.length) });
}
export default async function Rockets({ params }) {
  const { lang } = await params, R = t(lang).rk;
  return (
    <>
      <Masthead lang={lang} current="rockets" altPath="/rockets" />
      <main id="main" className="wrap page">
        <h1 className="page__title">{R.title}</h1>
        <p className="page__lead">{R.lead}</p>
        <RocketBrowser lang={lang} rows={ROCKETS.map(rocketRecord)} />
        <p className="note">{R.src(RK_UPDATED)}</p>
      </main>
      <Footer lang={lang} />
    </>
  );
}
