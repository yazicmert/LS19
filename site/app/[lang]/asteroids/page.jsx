import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import AsteroidTable from '@/components/AsteroidTable';
import { t, date } from '@/lib/i18n';
import { OBJECTS, RETRIEVED } from '@/lib/asteroids';

export async function generateMetadata({ params }) {
  const { lang } = await params, A = t(lang).ast;
  return { title: A.title, description: A.description, alternates: { languages: { en: '/en/asteroids', tr: '/tr/asteroids' } } };
}
export default async function Asteroids({ params }) {
  const { lang } = await params, L = t(lang), A = L.ast;
  return (
    <>
      <Masthead lang={lang} current="asteroids" altPath="/asteroids" />
      <main id="main" className="wrap page">
        <h1 className="page__title">{A.title}</h1>
        <p className="page__lead">{A.lead}</p>
        <AsteroidTable lang={lang} objects={OBJECTS} full />
        <p className="note">{L.home.modelsNote(date(lang, RETRIEVED))}</p>
      </main>
      <Footer lang={lang} />
    </>
  );
}
