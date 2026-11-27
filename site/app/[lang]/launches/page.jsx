// yaklaşan fırlatmalar (LL2): her satır bir efemeris kaydı; en erken zaman (UTC), araç, görev, rampa, durum; resmî yayına yönlendirme
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import { pageMeta } from '@/lib/seo';
import Footer from '@/components/Footer';
import NextLaunch from '@/components/NextLaunch';
import LaunchBrowser from '@/components/LaunchBrowser';
import { rocketForLL2 } from '@/lib/rockets';
import { t } from '@/lib/i18n';
import { getUpcoming, nextLaunch } from '@/lib/launches';
import { LS19_URL } from '@/lib/config';
import { ArrowOut, ArrowRight } from '@/components/Icon';
import { SITES, SITES_TOTAL } from '@/lib/sites';

export const revalidate = 1800;
export async function generateMetadata({ params }) {
  const { lang } = await params, L = t(lang).launch;
  return pageMeta(lang, '/launches', { title: L.title, description: L.description });
}
export default async function Launches({ params }) {
  const { lang } = await params, L = t(lang).launch;
  const up = await getUpcoming(), nl = up.ok ? nextLaunch(up.launches) : null, rest = up.launches.filter((x) => x !== nl);
  return (
    <>
      <Masthead lang={lang} current="launches" altPath="/launches" />
      <main id="main" className="wrap page">
        <h1 className="page__title">{L.title}</h1>
        <p className="page__lead">{L.lead}</p>
        <div className="lch">
          <section className="lch__next" aria-labelledby="lch-next"><NextLaunch lang={lang} launch={nl} ok={up.ok} headingId="lch-next" /></section>
          {up.ok && rest.length ? <LaunchBrowser lang={lang} rows={rest.map(({ mission, ...l }) => ({ ...l, rocket: rocketForLL2(l.vehicle)?.slug || null, mission: { name: mission.name, orbit: mission.orbit } }))} /> : null}
        </div>
        <section className="rec__sec lsx" aria-labelledby="lsx-h">
          <div className="sec__head"><h2 id="lsx-h" className="sec__title">{t(lang).ls.teaserT}</h2></div>
          <p className="ca__lead">{t(lang).ls.teaser(SITES.length, SITES_TOTAL.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US'))}</p>
          <ul className="lsx__list">
            {SITES.slice(0, 8).map((x) => <li key={x.slug}><Link href={`/${lang}/launches/sites/${x.slug}`}>{x.name}</Link><span className="mono">{x.stats.total.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}</span></li>)}
          </ul>
          <p><Link className="btn btn--ink" href={`/${lang}/launches/sites`}>{t(lang).ls.teaserLink}<ArrowRight /></Link></p>
        </section>
        <p className="note">
          {L.dataNote}{' '}
          <a className="lnk" href={`${LS19_URL}/?mode=lab&exp=ay`} rel="noopener">{L.inLS19}<ArrowOut size={11} /></a>
        </p>
      </main>
      <Footer lang={lang} />
    </>
  );
}
