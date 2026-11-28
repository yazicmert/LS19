// uydu kaydı: başlık (ad, NORAD, COSPAR, yörünge bölgesi); ortalama yörünge ve türetilmiş değerler; uydu (GCAT); fırlatma; 3B model; kaynaklar
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import ElementBlock from '@/components/ElementBlock';
import ModelViewer from '@/components/ModelViewer';
import Timeline from '@/components/Timeline';
import { satEvents, hasCurated } from '@/lib/history';
import EVENTS from '@/data/events.json';
import { pageMeta } from '@/lib/seo';
import { LANGS, LS19_URL } from '@/lib/config';
import { t, num, sig, date, dateTime } from '@/lib/i18n';
import { SATS, SAT_RETRIEVED, GP_INFO, GCAT_INFO, satById, satName } from '@/lib/satellites';
import { ArrowOut, ArrowRight } from '@/components/Icon';
import { withViz } from '@/components/viz';
import { satRows } from '@/components/satRows';

export const dynamicParams = false;
export function generateStaticParams() { return LANGS.flatMap((lang) => SATS.map((s) => ({ lang, id: s.id }))); }
export async function generateMetadata({ params }) {
  const { lang, id } = await params, s = satById(id); if (!s) return {};
  const S = t(lang).sat, D = s.derived;
  return pageMeta(lang, `/satellites/${id}`, {
    title: satName(s, lang),
    description: `${satName(s, lang)} (NORAD ${s.norad}, COSPAR ${s.cospar}): ${S.regime[D.regime]}, ${num(lang, D.perigee, 0)} × ${num(lang, D.apogee, 0)} km, i = ${num(lang, s.elements.i, 2)}°.`,
  });
}

export default async function Satellite({ params }) {
  const { lang, id } = await params, s = satById(id); if (!s) notFound();
  const L = t(lang), S = L.sat, A = L.ast, D = s.derived, G = s.gcat, name = satName(s, lang);
  const { orbit, derived, body, launch, vz, epoch } = satRows(lang, s, name), Ld = G && G.launch;
  const model = [
    ['', s.model.own ? S.m.title : S.m.same, s.model.title[lang], null, 'text'],
    ['', S.m.source, s.model.source, null, 'text'],
    ['', S.m.size, num(lang, s.model.size, 1), S.meter],
  ];
  return (
    <>
      <Masthead lang={lang} current="satellites" altPath={`/satellites/${s.id}`} />
      <main id="main" className="wrap rec">
        <nav className="crumb" aria-label="breadcrumb"><Link href={`/${lang}/satellites`}>{S.back(SATS.length)}</Link></nav>
        <header className="rec__head">
          <h1 className="rec__title">{name}</h1>
          <p className="rec__des">
            <span className="mono">NORAD {s.norad}</span>
            <span className="mono">{s.cospar}</span>
            <span>{S.regime[D.regime]}</span>
            {D.sso ? <span className="flag">{S.sso}</span> : null}
          </p>
        </header>
        <div className="rec__grid">
          <div className="rec__data">
            <ElementBlock caption={`${S.orbit} · ${S.epoch} ${epoch}`} rows={withViz(orbit, vz)} />
            <ElementBlock caption={S.derived} rows={withViz(derived, vz)} />
            <p className="el__note">{S.derivedNote}</p>
            {s.note ? <p className="el__note rec__warn">{s.note[lang]}</p> : null}
            {G ? <ElementBlock caption={S.body} rows={withViz(body, vz)} /> : null}
            {Ld ? <ElementBlock caption={S.launch} rows={launch} /> : null}
            <ElementBlock caption={S.model} rows={model} />
            <div className="rec__act">
              <a className="btn btn--cobalt" href={LS19_URL} rel="noopener">{S.live}<ArrowOut /></a>
              <p className="rec__actnote">{S.liveNote}</p>
            </div>
          </div>
          <div className="rec__model">
            <ModelViewer src={`/models/sat/${s.model.key}.glb`} label={S.viewer(name)} loading={A.viewerLoading} error={A.viewerError} hint={A.viewerHint}
              scaleLabel={A.scale} scaleValue={`${sig(lang, s.model.size, 3)} ${S.meter}`} keepMaterials yaw={0.9} />
          </div>
        </div>
        <section className="rec__sec" aria-labelledby="hist-h">
          <div className="sec__head"><h2 id="hist-h" className="sec__title">{L.hist.title}</h2></div>
          <p className="ca__lead">{L.hist.lead}</p>
          <Timeline lang={lang} events={satEvents(s, lang, SAT_RETRIEVED, EVENTS)} today={SAT_RETRIEVED} headingId="hist-h" />
          {hasCurated(EVENTS, 'satellites', s.id) ? <p className="note">{L.hist.srcNote}</p> : null}
        </section>
        <section className="rec__src" aria-labelledby="src-h">
          <h2 id="src-h" className="rec__srch">{A.sources}</h2>
          <ul>
            <li>{S.srcGp(epoch, GP_INFO.copied ? dateTime(lang, GP_INFO.copied) : date(lang, SAT_RETRIEVED))} <a href={`https://celestrak.org/NORAD/elements/gp.php?CATNR=${s.norad}&FORMAT=json`} rel="noopener">CelesTrak GP<ArrowOut size={11} /></a></li>
            {G ? <li>{S.srcGcat(GCAT_INFO.updated || SAT_RETRIEVED)} <a href="https://planet4589.org/space/gcat/" rel="noopener">GCAT<ArrowOut size={11} /></a></li> : null}
            <li>{S.srcModel}: {s.model.source}. <Link href={`/${lang}/sources`}>{L.nav.sources}<ArrowRight size={11} /></Link></li>
          </ul>
        </section>
      </main>
      <Footer lang={lang} />
    </>
  );
}
