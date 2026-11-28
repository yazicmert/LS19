// ana sayfa (sirküler No. 0001): başlık bandı; tek cümlelik tanım ve çalışan "cisim bul"; sıradaki fırlatmanın efemeris bloğu; 33 şekil modeli tablosu
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import Lookup from '@/components/Lookup';
import NextLaunch from '@/components/NextLaunch';
import AsteroidTable from '@/components/AsteroidTable';
import SatTable from '@/components/SatTable';
import { SATS, SAT_RETRIEVED, FEATURED_SATS, satById } from '@/lib/satellites';
import { t, date } from '@/lib/i18n';
import { OBJECTS, RETRIEVED, lookupRecord } from '@/lib/asteroids';
import { getUpcoming, nextLaunch } from '@/lib/launches';
import { ArrowRight, ArrowOut } from '@/components/Icon';
import { LS19_URL, REPO_URL } from '@/lib/config';
import { pageMeta } from '@/lib/seo';

export const revalidate = 1800;
export async function generateMetadata({ params }) {
  const { lang } = await params, L = t(lang);
  return pageMeta(lang, '', { title: L.home.title, description: L.home.description, absolute: true });
}

export default async function Home({ params }) {
  const { lang } = await params, L = t(lang);
  const up = await getUpcoming(), nl = up.ok ? nextLaunch(up.launches) : null;
  return (
    <>
      <Masthead lang={lang} size="full" />
      <main id="main">
        <section className="lead wrap">
          <div className="lead__main">
            <h1 className="lead__hook">{L.home.hook}</h1>
            <p className="lead__sub">{L.home.sub}</p>
            <Lookup lang={lang} objects={OBJECTS.map(lookupRecord)} />
          </div>
          <aside className="lead__side" aria-labelledby="nl-h">
            <NextLaunch lang={lang} launch={nl} ok={up.ok} headingId="nl-h" />
          </aside>
        </section>
        <section className="sec wrap" aria-labelledby="models-h">
          <div className="sec__head">
            <h2 id="models-h" className="sec__title">{L.home.modelsTitle(OBJECTS.length)}</h2>
            <Link className="lnk" href={`/${lang}/asteroids`}>{L.home.allObjects}<ArrowRight /></Link>
          </div>
          <AsteroidTable lang={lang} objects={OBJECTS} />
          <p className="note">{L.home.modelsNote(date(lang, RETRIEVED))}</p>
        </section>
        <section className="sec wrap" aria-labelledby="sats-h">
          <div className="sec__head">
            <h2 id="sats-h" className="sec__title">{L.sat.homeTitle(SATS.length)}</h2>
            <span className="sec__links">
              <Link className="lnk" href={`/${lang}/satellites/stats`}>{L.sst.homeLink}<ArrowRight /></Link>
              <Link className="lnk" href={`/${lang}/satellites`}>{L.sat.homeAll}<ArrowRight /></Link>
            </span>
          </div>
          <SatTable lang={lang} sats={FEATURED_SATS.map(satById).filter(Boolean)} label={L.sat.homeTitle(SATS.length)} />
          <p className="note">{L.sat.homeNote(date(lang, SAT_RETRIEVED))}</p>
        </section>
        <section className="sec wrap how" aria-labelledby="how-h">
          <h2 id="how-h" className="sec__title">{L.home.howTitle}</h2>
          <dl className="how__list">
            {L.home.how.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
          </dl>
          <div className="how__next">
            <h3 className="how__h">{L.home.nextTitle}</h3>
            <ul>{L.home.next.map(([k, v]) => (<li key={k}><b>{k}</b> {v}</li>))}</ul>
            <p className="how__links">
              <a className="lnk" href={`${REPO_URL}/blob/main/docs/yol_haritasi.md`} rel="noopener">{L.home.roadmap}<ArrowOut size={12} /></a>
              <a className="lnk" href={LS19_URL} rel="noopener">{L.nav.ls19}<ArrowOut size={12} /></a>
            </p>
          </div>
        </section>
      </main>
      <Footer lang={lang} />
    </>
  );
}
