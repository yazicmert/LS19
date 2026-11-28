// katalogdaki herhangi bir uydu (CelesTrak etkin kümesi, ~17 000): ilk istekte GP kopyası ve GCAT özetinden üretilir, 6 saat önbellekte
// kalır (ISR; GP kopyası 2 saatte bir yenilenir). 3B modeli olan uydulardan biriyse onun zengin sayfasına yönlenir. Etkin kümede yoksa 404;
// GP kopyası okunamazsa hata sayfası (önbellekte önceki sayfa varsa o sunulur).
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import ElementBlock from '@/components/ElementBlock';
import Timeline from '@/components/Timeline';
import { satEvents } from '@/lib/history';
import EVENTS from '@/data/events.json';
import { pageMeta } from '@/lib/seo';
import { LS19_URL } from '@/lib/config';
import { t, num, date, dateTime } from '@/lib/i18n';
import { satById } from '@/lib/satellites';
import { liveSat, CAT_INFO } from '@/lib/satcat-live';
import { ArrowOut, ArrowRight } from '@/components/Icon';
import { SatOrbitPlan, withViz } from '@/components/viz';
import { satRows } from '@/components/satRows';

export const revalidate = 21600;
export const dynamicParams = true;
export function generateStaticParams() { return []; }

async function load(norad) {
  if (!/^\d{1,6}$/.test(norad)) return {};
  const id = String(+norad);
  if (id !== norad) return { canonical: id };                              // "025544" → 25544
  if (satById(id)) return { redirectTo: id };
  try { return (await liveSat(id)) || {}; } catch (e) { return { error: String(e.message || e) }; }
}
export async function generateMetadata({ params }) {
  const { lang, norad } = await params, r = await load(norad), C = t(lang).satcat;
  if (!r.s) return { title: C.title };
  const s = r.s, D = s.derived;
  return pageMeta(lang, `/sat/${s.id}`, { title: s.name, description: C.metaDesc(s.name, s.norad, s.cospar, t(lang).sat.regime[D.regime], num(lang, D.perigee, 0), num(lang, D.apogee, 0), num(lang, s.elements.i, 2)) });
}
export default async function CatalogSatellite({ params }) {
  const { lang, norad } = await params, r = await load(norad);
  if (r.canonical) redirect(`/${lang}/sat/${r.canonical}`);
  if (r.redirectTo) redirect(`/${lang}/satellites/${r.redirectTo}`);
  if (r.error) throw new Error(r.error);                                      // geçici kaynak hatası: önbellekteki son sayfa sunulur
  if (!r.s) notFound();
  const s = r.s, L = t(lang), S = L.sat, A = L.ast, C = L.satcat, D = s.derived, G = s.gcat, name = s.name;
  const { orbit, derived, body, launch, vz, epoch } = satRows(lang, s, name, { extra: true }), Ld = G && G.launch;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <Masthead lang={lang} current="satellites" altPath={`/sat/${s.id}`} />
      <main id="main" className="wrap rec">
        <nav className="crumb" aria-label="breadcrumb"><Link href={`/${lang}/satellites`}>{C.back}</Link></nav>
        <header className="rec__head">
          <h1 className="rec__title">{name}</h1>
          <p className="rec__des">
            <span className="mono">NORAD {s.norad}</span>
            {s.cospar ? <span className="mono">{s.cospar}</span> : null}
            <span>{S.regime[D.regime]}</span>
            {D.sso ? <span className="flag">{S.sso}</span> : null}
          </p>
        </header>
        <div className="rec__grid">
          <div className="rec__data">
            <ElementBlock caption={`${S.orbit} · ${S.epoch} ${epoch}`} rows={withViz(orbit, vz)} />
            <ElementBlock caption={S.derived} rows={withViz(derived, vz)} />
            <p className="el__note">{S.derivedNote}</p>
            {G ? <ElementBlock caption={S.body} rows={withViz(body, vz)} /> : <p className="el__note rec__warn">{C.noGcat}</p>}
            {Ld ? <ElementBlock caption={S.launch} rows={launch} /> : null}
            <div className="rec__act">
              <a className="btn btn--cobalt" href={LS19_URL} rel="noopener">{S.live}<ArrowOut /></a>
              <p className="rec__actnote">{S.liveNote}</p>
            </div>
          </div>
          <div className="rec__model">
            <SatOrbitPlan a={D.a} e={s.elements.e} w={s.elements.w} lang={lang} name={name} />
          </div>
        </div>
        <section className="rec__sec" aria-labelledby="hist-h">
          <div className="sec__head"><h2 id="hist-h" className="sec__title">{L.hist.title}</h2></div>
          <p className="ca__lead">{L.hist.lead}</p>
          <Timeline lang={lang} events={satEvents(s, lang, today, EVENTS)} today={today} headingId="hist-h" />
        </section>
        <section className="rec__src" aria-labelledby="src-h">
          <h2 id="src-h" className="rec__srch">{A.sources}</h2>
          <ul>
            <li>{S.srcGp(epoch, r.copied ? dateTime(lang, r.copied) : date(lang, today))} <a href={`https://celestrak.org/NORAD/elements/gp.php?CATNR=${s.norad}&FORMAT=json`} rel="noopener">CelesTrak GP<ArrowOut size={11} /></a></li>
            {G ? <li>{C.srcGcat(CAT_INFO.gcat.updated || CAT_INFO.retrieved, date(lang, CAT_INFO.retrieved))} <a href="https://planet4589.org/space/gcat/" rel="noopener">GCAT<ArrowOut size={11} /></a></li> : null}
            <li><Link href={`/${lang}/sources`}>{L.nav.sources}<ArrowRight size={11} /></Link></li>
          </ul>
        </section>
      </main>
      <Footer lang={lang} />
    </>
  );
}
