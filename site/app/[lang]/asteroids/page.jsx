import Masthead from '@/components/Masthead';
import { pageMeta } from '@/lib/seo';
import Footer from '@/components/Footer';
import AsteroidBrowser from '@/components/AsteroidBrowser';
import Link from 'next/link';
import { t, date, num } from '@/lib/i18n';
import { catalogCount } from '@/lib/sbdb-live';
import { ArrowRight } from '@/components/Icon';
import { OBJECTS, RETRIEVED, tableRecord } from '@/lib/asteroids';

export async function generateMetadata({ params }) {
  const { lang } = await params, A = t(lang).ast;
  return pageMeta(lang, '/asteroids', { title: A.title, description: A.description });
}
export default async function Asteroids({ params }) {
  const { lang } = await params, L = t(lang), A = L.ast, total = await catalogCount();
  return (
    <>
      <Masthead lang={lang} current="asteroids" altPath="/asteroids" />
      <main id="main" className="wrap page">
        <h1 className="page__title">{A.title}</h1>
        <p className="page__lead">{A.lead}</p>
        <p className="cat__banner">{L.cat.banner(num(lang, total, 0))} <Link className="lnk" href={`/${lang}/asteroids/all`}>{L.cat.bannerLink}<ArrowRight /></Link></p>
        <AsteroidBrowser lang={lang} rows={OBJECTS.map(tableRecord)} />
        <p className="note">{L.home.modelsNote(date(lang, RETRIEVED))}</p>
      </main>
      <Footer lang={lang} />
    </>
  );
}
