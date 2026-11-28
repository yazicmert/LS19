// fırlatma üsleri dizini: küre, konumun yakıta etkisi (açıklama ve hesaplayıcı), bütün üslerin tablosu. Veri: data/sites.json (GCAT).
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import SiteGlobe from '@/components/SiteGlobe';
import LaunchCalc from '@/components/LaunchCalc';
import { pageMeta } from '@/lib/seo';
import { t, num, date } from '@/lib/i18n';
import { SITES, SITES_RETRIEVED, SITES_UPDATED, SITES_TOTAL, countryName, globeSites, fmtLat } from '@/lib/sites';
import { V_EQ, rotSpeed, planeChange, gtoToGeo, propFraction, siteSummary, siteFeatures } from '@/lib/launchsite';

export async function generateMetadata({ params }) {
  const { lang } = await params, L = t(lang).ls;
  return pageMeta(lang, '/launches/sites', { title: L.title, description: L.description });
}
export default async function LaunchSites({ params }) {
  const { lang } = await params, T = t(lang), L = T.ls, C = L.cols;
  const pct = (x) => `%${num(lang, 100 * x, 1)}`, pctEn = (x) => `${num(lang, 100 * x, 1)}%`, P = lang === 'tr' ? pct : pctEn;
  const calcSites = SITES.filter((s) => s.lat != null && !s.sea).map((s) => ({ slug: s.slug, name: s.name, lat: s.lat }));
  return (
    <>
      <Masthead lang={lang} current="sites" altPath="/launches/sites" />
      <main id="main" className="wrap page">
        <nav className="crumb" aria-label="breadcrumb"><Link href={`/${lang}/launches`}>{T.nav.launches}</Link></nav>
        <h1 className="page__title">{L.title}</h1>
        <p className="page__lead">{L.lead}</p>
        <SiteGlobe sites={globeSites(lang, L)} lang={lang} />

        <section className="rec__sec" aria-labelledby="why-h">
          <div className="sec__head"><h2 id="why-h" className="sec__title">{L.whyT}</h2></div>
          <div className="why">
            {L.why.map(([h, body], k) => (
              <div key={k} className="why__item">
                <h3 className="pr__h">{h}</h3>
                <p className="pr__p">{body({ eq: num(lang, V_EQ, 0), k: num(lang, rotSpeed(5.24), 0), p: num(lang, rotSpeed(62.92), 0), lc: num(lang, planeChange(10), 0) })}</p>
              </div>
            ))}
          </div>
          <p className="note">{L.fuelNote(P(propFraction(gtoToGeo(0), 320)), P(propFraction(gtoToGeo(28.5), 320)))}</p>
        </section>

        <section className="rec__sec" aria-labelledby="calc-h">
          <div className="sec__head"><h2 id="calc-h" className="sec__title">{L.calcT}</h2></div>
          <p className="ca__lead">{L.calcLead}</p>
          <LaunchCalc lang={lang} sites={calcSites} />
        </section>

        <section className="rec__sec" aria-labelledby="tbl-h">
          <div className="sec__head"><h2 id="tbl-h" className="sec__title">{L.tableT}</h2></div>
          <p className="ca__lead">{L.tableLead}</p>
          <div className="tbl" role="region" aria-labelledby="tbl-h" tabIndex={0}>
            <table>
              <thead><tr><th scope="col">{C.site}</th><th scope="col">{C.country}</th><th scope="col" className="r">{C.lat}</th><th scope="col" className="r">{C.n}</th><th scope="col" className="r">{C.years}</th><th scope="col" className="r">{C.rot}</th><th scope="col" className="r">{C.minInc}</th><th scope="col" className="r">{C.geo}</th><th scope="col" className="r">{C.extra}</th></tr></thead>
              <tbody>
                {SITES.map((s) => {
                  const E = siteSummary(s), y0 = s.stats.first.slice(0, 4), y1 = s.stats.last.slice(0, 4);
                  return (
                    <tr key={s.slug}>
                      <th scope="row"><Link href={`/${lang}/launches/sites/${s.slug}`}>{s.name}</Link>{s.sea ? <span className="flag flag--sm">{L.sea}</span> : null}{siteFeatures(s, SITES_RETRIEVED).active ? null : <span className="flag flag--sm">{L.feat.off}</span>}</th>
                      <td className="txt">{countryName(lang, s.cc)}</td>
                      <td className="r">{fmtLat(lang, s.lat)}</td>
                      <td className="r">{num(lang, s.stats.total, 0)}</td>
                      <td className="r">{y0 === y1 ? y0 : `${y0}–${y1}`}</td>
                      <td className="r">{num(lang, E.rot, 0)}</td>
                      <td className="r">{num(lang, E.minInc, 1)}°</td>
                      <td className="r">{num(lang, E.geoDv, 0)}</td>
                      <td className="r">+{num(lang, E.geoExtra, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note">{L.assume}</p>
          <p className="note">{L.seaNote}</p>
          <p className="note">{L.src(date(lang, SITES_RETRIEVED), SITES_UPDATED)} · {L.launchesN(num(lang, SITES_TOTAL, 0))}</p>
        </section>
      </main>
      <Footer lang={lang} />
    </>
  );
}
