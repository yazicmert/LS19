// uydu kaydı: başlık (ad, NORAD, COSPAR, yörünge bölgesi); ortalama yörünge ve türetilmiş değerler; uydu (GCAT); fırlatma; 3B model; kaynaklar
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import ElementBlock from '@/components/ElementBlock';
import ModelViewer from '@/components/ModelViewer';
import { pageMeta } from '@/lib/seo';
import { LANGS, LS19_URL } from '@/lib/config';
import { t, num, sig, sci, date, dateTime } from '@/lib/i18n';
import { SATS, SAT_RETRIEVED, GP_INFO, GCAT_INFO, satById, satName } from '@/lib/satellites';
import { ArrowOut, ArrowRight } from '@/components/Icon';

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
  const L = t(lang), S = L.sat, A = L.ast, E = s.elements, D = s.derived, G = s.gcat, el = S.el, name = satName(s, lang);
  const orbit = [
    ['i', el.i, num(lang, E.i, 4), '°'],
    ['e', el.e, num(lang, E.e, 7), null],
    ['Ω', el.om, num(lang, E.om, 4), '°'],
    ['ω', el.w, num(lang, E.w, 4), '°'],
    ['M', el.ma, num(lang, E.ma, 4), '°'],
    ['n', el.n, num(lang, E.n, 8), S.revDay],
    ['B*', el.bstar, sci(lang, E.bstar, 3), S.perEr],
  ];
  const derived = [
    ['a', el.a, num(lang, D.a, 1), A.km],
    ['hₚ', el.perigee, num(lang, D.perigee, 1), A.km],
    ['hₐ', el.apogee, num(lang, D.apogee, 1), A.km],
    ['P', el.period, num(lang, D.period, 2), S.min],
    ['dΩ/dt', el.nodal, num(lang, D.nodal, 4), S.degDay, null, D.sso ? S.sso : null],
  ];
  const dims = G ? [G.length, G.diameter, G.span] : [];
  const body = G ? [
    G.name && G.name !== name ? ['', S.b.catalog, G.name, null, 'text'] : null,
    ['', S.b.owner, G.owner.join(' / ') || null, null, 'text'],
    ['', S.b.manufacturer, G.manufacturer.join(' / ') || null, null, 'text'],
    ['', S.b.bus, G.bus, null],
    ['', S.b.mass, G.mass != null ? num(lang, G.mass, 0) : null, S.kg],
    G.dryMass != null ? ['', S.b.dry, num(lang, G.dryMass, 0), S.kg] : null,
    dims.some((x) => x != null) ? ['', S.b.dims, dims.map((x) => (x == null ? '–' : num(lang, x, 1))).join(' × '), S.meter] : null,
    ['', S.b.state, G.state, null],
  ] : [];
  const Ld = G && G.launch;
  const launch = Ld ? [
    ['', S.l.date, Ld.date ? `${Ld.date.iso}${Ld.date.time ? ` ${Ld.date.time}` : ''}${Ld.date.uncertain ? ' ?' : ''}` : null, null],
    ['', S.l.vehicle, Ld.vehicle, null, 'text'],
    Ld.flight ? ['', S.l.flight, Ld.flight, null, 'text'] : null,
    ['', S.l.site, Ld.site, null, 'text', Ld.pad],
    ['', S.l.cospar, s.cospar, null],
  ] : [];
  const model = [
    ['', s.model.own ? S.m.title : S.m.same, s.model.title[lang], null, 'text'],
    ['', S.m.source, s.model.source, null, 'text'],
    ['', S.m.size, num(lang, s.model.size, 1), S.meter],
  ];
  const epoch = dateTime(lang, s.epoch);
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
            <ElementBlock caption={`${S.orbit} · ${S.epoch} ${epoch}`} rows={orbit} />
            <ElementBlock caption={S.derived} rows={derived} />
            <p className="el__note">{S.derivedNote}</p>
            {s.note ? <p className="el__note rec__warn">{s.note[lang]}</p> : null}
            {G ? <ElementBlock caption={S.body} rows={body} /> : null}
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
