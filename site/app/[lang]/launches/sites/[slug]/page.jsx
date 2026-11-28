// fırlatma üssü kaydı: konum (küre), sayılar, yıllara göre fırlatmalar, roketler, rampalar, ulaşılan eğimler, konumun yakıt bedeli ve
// 1957'den bu yana bütün fırlatmalar (yıllara göre açılır). Veri: data/sites.json (GCAT, J. McDowell, CC BY 4.0).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import SiteGlobe from '@/components/SiteGlobe';
import ElementBlock from '@/components/ElementBlock';
import { YearBars, InclBars } from '@/components/SiteCharts';
import { pageMeta } from '@/lib/seo';
import { LANGS } from '@/lib/config';
import { t, num, date } from '@/lib/i18n';
import { SITES, SITES_RETRIEVED, SITES_UPDATED, siteBySlug, countryName, globeSites, fmtLat, fmtLon, rocketHref } from '@/lib/sites';
import { siteSummary, inclHistogram, inclFromAz, siteFeatures } from '@/lib/launchsite';

export const dynamicParams = false;
export function generateStaticParams() { return LANGS.flatMap((lang) => SITES.map((s) => ({ lang, slug: s.slug }))); }
export async function generateMetadata({ params }) {
  const { lang, slug } = await params, s = siteBySlug(slug); if (!s) return {};
  const L = t(lang).ls;
  return pageMeta(lang, `/launches/sites/${slug}`, { title: s.name, description: `${s.name} (${countryName(lang, s.cc)}): ${L.launchesN(num(lang, s.stats.total, 0))}, ${s.stats.first.slice(0, 4)}–${s.stats.last.slice(0, 4)}. ${fmtLat(lang, s.lat)}, ${fmtLon(lang, s.lon)}.` });
}
export default async function Site({ params }) {
  const { lang, slug } = await params, s = siteBySlug(slug); if (!s) notFound();
  const T = t(lang), L = T.ls, St = s.stats, E = siteSummary(s), out = T.rk.out;
  const years = Object.entries(s.byYear).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), peak = years[0];
  const byYear = {}; for (const l of [...s.launches].reverse()) (byYear[l.d.slice(0, 4)] ||= []).push(l);
  const yearList = Object.keys(byYear).sort().reverse();
  const ir = E.range ? inclFromAz(s.lat, E.range.az) : null, Ft = L.feat, FS = siteFeatures(s, SITES_RETRIEVED), pct = (x) => `${num(lang, 100 * x, 0)} %`;
  const feat = [
    ['', Ft.country, countryName(lang, s.cc), null, 'text'],
    ['', Ft.operator, s.operator ? `${s.operator.short}${s.operator.name && s.operator.name !== s.operator.short ? ` (${s.operator.name})` : ''}` : Ft.opNone, null, 'text', s.operator && s.operator.cls ? Ft.opCls[s.operator.cls] : null],
    ['', Ft.since, Ft.sinceVal(s.established, St.last.slice(0, 4), FS.active), null, 'text'],
    ['', Ft.status, FS.active ? Ft.on : Ft.off, null, 'text', Ft.statusNote],
    ['', Ft.kind, s.sea ? Ft.sea : Ft.land, null, 'text'],
    s.pads.length ? ['', Ft.pads, Ft.padsVal(num(lang, FS.pads.active, 0), num(lang, FS.pads.total, 0)), null, 'text'] : null,
    FS.orbits.length ? ['', Ft.orbitsTop, FS.orbits.slice(0, 4).map((o) => `≈ ${o.deg}°${o.k ? ` (${Ft.oc[o.k]})` : ''} ${pct(o.share)}`).join(' · '), null, 'text'] : null,
  ];
  const eff = [
    ['', L.eff.rot, num(lang, E.rot, 0), 'm/s'],
    ['', L.eff.minInc, num(lang, E.minInc, 1), '°'],
    ['', L.eff.geo, num(lang, E.geoDv, 0), 'm/s'],
    ['', L.eff.extra, `+${num(lang, E.geoExtra, 0)}`, 'm/s'],
    E.range ? ['', L.eff.range, `${num(lang, E.range.az[0], 1)}°–${num(lang, E.range.az[1], 1)}°`, null, null, `→ i ${num(lang, ir[0], 1)}°–${num(lang, ir[1], 1)}°`] : null,
  ];
  const stats = [['total', num(lang, St.total, 0)], ['success', num(lang, St.success, 0)], ['failure', num(lang, St.failure, 0)], ['deep', num(lang, St.deep, 0)], ['first', St.first], ['last', St.last]];
  return (
    <>
      <Masthead lang={lang} current="sites" altPath={`/launches/sites/${s.slug}`} />
      <main id="main" className="wrap rec">
        <nav className="crumb" aria-label="breadcrumb"><Link href={`/${lang}/launches/sites`}>{L.back}</Link></nav>
        <header className="rec__head">
          <h1 className="rec__title">{s.name}</h1>
          <p className="rec__des">
            <span>{countryName(lang, s.cc)}</span>
            <span className="mono">{fmtLat(lang, s.lat)}, {fmtLon(lang, s.lon)}</span>
            {s.sea ? <span className="flag">{L.sea}</span> : null}
          </p>
          {s.full && s.full !== s.name ? <p className="rec__sub">{s.full.replace(/[\s,;]+$/, '')}</p> : null}
        </header>
        <div className="rec__grid">
          <div className="rec__data">
            <dl className="pr__stats">{stats.map(([k, v]) => <div key={k}><dt>{L.stats[k]}</dt><dd className="mono">{v}</dd></div>)}</dl>
            <ElementBlock caption={Ft.title} rows={feat} />
            <p className="ls__now"><b>{Ft.now}</b> {FS.rocketsNow.length ? FS.rocketsNow.map((r, k) => { const h = rocketHref(lang, r.slug); return <span key={r.name}>{k ? ', ' : ''}{h ? <Link href={h}>{r.name}</Link> : r.name} <span className="mono">{num(lang, r.n, 0)}</span></span>; }) : Ft.none}</p>
            <ElementBlock caption={L.effT} rows={eff} />
            <p className="el__note">{L.assume}</p>
          </div>
          <div className="rec__model"><SiteGlobe sites={globeSites(lang, L)} focus={s.slug} lang={lang} height={380} /></div>
        </div>

        <section className="rec__sec" aria-labelledby="yr-h">
          <div className="sec__head"><h2 id="yr-h" className="sec__title">{L.yearT}</h2></div>
          <p className="ca__lead">{L.yearLead(St.first.slice(0, 4), St.last.slice(0, 4), num(lang, peak[1], 0), peak[0])}</p>
          <YearBars lang={lang} byYear={Object.fromEntries(Object.entries(s.byYear).map(([y, v]) => [+y, v]))} label={L.yearT} />
        </section>

        <section className="rec__sec" aria-labelledby="inc-h">
          <div className="sec__head"><h2 id="inc-h" className="sec__title">{L.incT}</h2></div>
          <p className="ca__lead">{L.incLead(num(lang, Math.abs(s.lat), 1))}</p>
          <InclBars lang={lang} hist={inclHistogram(s.launches)} lat={s.lat} label={L.incT} />
        </section>

        <div className="pr__cols">
          <section className="rec__sec" aria-labelledby="rk-h">
            <div className="sec__head"><h2 id="rk-h" className="sec__title">{L.rocketsT}</h2></div>
            <div className="tbl" role="region" aria-labelledby="rk-h" tabIndex={0}>
              <table>
                <thead><tr><th scope="col">{L.rkCols.name}</th><th scope="col" className="r">{L.rkCols.n}</th><th scope="col">{L.rkCols.share}</th></tr></thead>
                <tbody>
                  {s.rockets.map((r) => { const h = rocketHref(lang, r.slug), w = (100 * r.n) / St.total; return (
                    <tr key={r.name}>
                      <th scope="row">{h ? <Link href={h}>{r.name}</Link> : r.name}</th>
                      <td className="r">{num(lang, r.n, 0)}</td>
                      <td className="pr__sh"><span className="pr__bar" aria-hidden="true"><span style={{ width: `${Math.max(0.6, w)}%` }} /></span><span className="mono">{num(lang, w, 1)} %</span></td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </section>
          {s.pads.length ? (
            <section className="rec__sec" aria-labelledby="pad-h">
              <div className="sec__head"><h2 id="pad-h" className="sec__title">{L.padsT}</h2></div>
              <div className="tbl" role="region" aria-labelledby="pad-h" tabIndex={0}>
                <table>
                  <thead><tr><th scope="col">{L.padCols.name}</th><th scope="col" className="r">{L.padCols.n}</th><th scope="col" className="r">{L.padCols.first}</th><th scope="col" className="r">{L.padCols.last}</th></tr></thead>
                  <tbody>
                    {s.pads.map((p) => (
                      <tr key={p.code}><th scope="row" title={p.lat != null ? `${fmtLat(lang, p.lat)}, ${fmtLon(lang, p.lon)}` : undefined}>{p.name}</th><td className="r">{num(lang, p.n, 0)}</td><td className="r">{p.first ? p.first.slice(0, 4) : '—'}</td><td className="r">{p.last ? p.last.slice(0, 4) : '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>

        <section className="rec__sec" aria-labelledby="ls-h">
          <div className="sec__head"><h2 id="ls-h" className="sec__title">{L.listT}</h2></div>
          <p className="ca__lead">{L.listLead(num(lang, St.total, 0))}</p>
          <div className="yrs">
            {yearList.map((y, k) => (
              <details key={y} className="yrs__y" open={k === 0}>
                <summary><span className="mono">{y}</span><span className="yrs__n">{L.launchesN(num(lang, byYear[y].length, 0))}</span></summary>
                <div className="tbl" role="region" aria-label={`${L.listT} ${y}`} tabIndex={0}>
                  <table className="tbl--text">
                    <thead><tr><th scope="col">{L.lcols.date}</th><th scope="col">{L.lcols.rocket}</th><th scope="col">{L.lcols.mission}</th><th scope="col">{L.lcols.pad}</th><th scope="col" className="r">{L.lcols.inc}</th><th scope="col">{L.lcols.out}</th></tr></thead>
                    <tbody>
                      {byYear[y].map((l) => { const h = rocketHref(lang, s.rockets.find((r) => r.name === l.lv)?.slug); return (
                        <tr key={l.tag}>
                          <td className="mono">{l.d}{l.t ? ` ${l.t}` : ''}</td>
                          <td>{h ? <Link href={h}>{l.lv}</Link> : l.lv}</td>
                          <td>{l.m || '—'}{l.deep ? <span className="flag flag--sm">{L.deep}</span> : null}{l.air ? <span className="flag flag--sm">{L.air}</span> : null}</td>
                          <td className="mono">{l.pad || '—'}</td>
                          <td className="r mono">{l.inc != null ? `${num(lang, l.inc, 1)}°` : '—'}</td>
                          <td><span className={l.o === 'F' ? 'flag flag--sm flag--ink' : 'flag flag--sm'}>{out[l.o]}</span></td>
                        </tr>
                      ); })}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
          <p className="note">{L.src(date(lang, SITES_RETRIEVED), SITES_UPDATED)} {L.gcat}: {s.gcat.join(', ')}.</p>
        </section>
      </main>
      <Footer lang={lang} />
    </>
  );
}
