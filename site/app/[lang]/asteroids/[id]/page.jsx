// cisim kaydı: başlık (ad, gösterim, sınıf, bayraklar); yörünge ve fiziksel element blokları; gerçek şekil modeli (3B); LS19'da aç; kaynak satırları
import Link from 'next/link';
import { pageMeta } from '@/lib/seo';
import { notFound } from 'next/navigation';
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import ElementBlock from '@/components/ElementBlock';
import ModelViewer from '@/components/ModelViewer';
import Approaches from '@/components/Approaches';
import { LANGS, LS19_URL } from '@/lib/config';
import { t, num, sig, sci, date, clsName } from '@/lib/i18n';
import { OBJECTS, RETRIEVED, CAD, byId, auKm, ls19Link } from '@/lib/asteroids';
import { ArrowOut, ArrowRight } from '@/components/Icon';

export const dynamicParams = false;
export function generateStaticParams() { return LANGS.flatMap((lang) => OBJECTS.map((o) => ({ lang, id: o.id }))); }
export async function generateMetadata({ params }) {
  const { lang, id } = await params, o = byId(id); if (!o) return {};
  const A = t(lang).ast;
  return pageMeta(lang, `/asteroids/${id}`, {
    title: o.name,
    description: `${o.fullname}: ${clsName(lang, o.orbitClass)}; a = ${num(lang, o.elements.a, 4)} au, e = ${num(lang, o.elements.e, 4)}, i = ${num(lang, o.elements.i, 2)}°. ${A.methodLong[o.model.method]}.`,
  });
}

export default async function Asteroid({ params }) {
  const { lang, id } = await params, o = byId(id); if (!o) notFound();
  const L = t(lang), A = L.ast, E = o.elements, Sg = o.sigma || {}, P = o.phys, M = o.model, el = A.el, So = o.solution || {}, R = A.risk, sen = o.sentry;
  const pm = (k) => (Sg[k] != null ? `± ${sci(lang, Sg[k])}` : null);
  const moidKm = auKm(o.moid), longest = Math.max(...M.dims);
  const orbit = [
    ['a', el.a, num(lang, E.a, 6), 'au', null, pm('a')],
    ['e', el.e, num(lang, E.e, 6), null, null, pm('e')],
    ['i', el.i, num(lang, E.i, 4), '°', null, pm('i')],
    ['Ω', el.om, num(lang, E.om, 4), '°', null, pm('om')],
    ['ω', el.w, num(lang, E.w, 4), '°', null, pm('w')],
    ['M', el.ma, num(lang, E.ma, 4), '°', null, pm('ma')],
    ['q', el.q, num(lang, E.q, 6), 'au', null, pm('q')],
    ['Q', el.ad, num(lang, E.ad, 6), 'au', null, pm('ad')],
    ['P', el.per, num(lang, E.per, 1), A.days, null, pm('per')],
    ['MOID', el.moid, sig(lang, o.moid, 4), moidKm != null && moidKm < 1e8 ? `au · ${num(lang, moidKm, 0)} ${A.km}` : 'au'],
  ];
  const phys = [
    ['H', el.H, num(lang, P.H, 2), null],
    ['D', el.D, sig(lang, P.diameter, 3), A.km],
    ['T', el.rot, P.rotPer != null ? num(lang, P.rotPer, P.rotPer < 10 ? 4 : 2) : null, A.hours],
    ['pᵥ', el.alb, P.albedo != null ? num(lang, P.albedo, 3) : null, null],
    ['', el.spec, [P.specB && `SMASS ${P.specB}`, P.specT && `Tholen ${P.specT}`].filter(Boolean).join(' · ') || null, null],
  ];
  const S = A.sol, u = o.conditionCode == null ? null : Number(o.conditionCode);
  const solution = [
    ['', S.id, So.id, null],
    ['', S.date, So.date, null],
    ['', S.obs, num(lang, So.nObs, 0), null],
    (So.nDel || So.nDop) ? ['', S.radar, `${num(lang, So.nDel || 0, 0)} / ${num(lang, So.nDop || 0, 0)}`, null] : null,
    ['', S.arc, So.first && So.last ? `${So.first} – ${So.last}` : null, null, null, o.dataArc != null ? `${num(lang, o.dataArc, 0)} ${A.days}` : null],
    ['', S.rms, num(lang, So.rms, 3), '″'],
    ['U', S.u, u == null ? null : String(u), null, null, S.uMeaning(u)],
  ];
  const risk = sen && sen.status === 'listed' ? [
    ['', R.ip, sci(lang, sen.ip, 3), null, null, sen.ip > 0 ? R.oneIn(num(lang, Math.round(1 / sen.ip), 0)) : null],
    ['', R.psCum, num(lang, sen.psCum, 2), null],
    ['', R.psMax, num(lang, sen.psMax, 2), null],
    ['', R.tsMax, sen.tsMax == null ? '0' : String(sen.tsMax), null],
    ['', R.nImp, num(lang, sen.nImp, 0), null],
    sen.years ? ['', R.years, sen.years[0] === sen.years[1] ? String(sen.years[0]) : `${sen.years[0]}–${sen.years[1]}`, null] : null,
    ['', R.computed, sen.computed, null],
  ] : null;
  const model = [
    ['', el.method, A.methodLong[M.method], null, 'text'],
    ['', el.dims, M.dims.map((x) => sig(lang, x, 3)).join(' × '), A.km],
    ['', el.tris, num(lang, M.tris, 0), null],
    ['', el.src, M.source[lang], null, 'text'],
  ];
  return (
    <>
      <Masthead lang={lang} current="asteroids" altPath={`/asteroids/${o.id}`} />
      <main id="main" className="wrap rec">
        <nav className="crumb" aria-label="breadcrumb"><Link href={`/${lang}/asteroids`}>{A.back}</Link></nav>
        <header className="rec__head">
          <h1 className="rec__title">{o.name}</h1>
          <p className="rec__des">
            <span className="mono">{o.fullname}</span>
            <span>{clsName(lang, o.orbitClass)}</span>
            {o.neo ? <span className="flag">{A.flags.neo}</span> : null}
            {o.pha ? <span className="flag flag--ink">{A.flags.pha}</span> : null}
          </p>
        </header>
        <div className="rec__grid">
          <div className="rec__data">
            <ElementBlock caption={`${A.orbit} · ${A.epoch} ${o.epoch.date} TDB`} rows={orbit} />
            <p className="el__note">{A.sigmaNote}</p>
            <ElementBlock caption={S.title} rows={solution} />
            <ElementBlock caption={A.phys} rows={phys} />
            <ElementBlock caption={A.model} rows={model} />
            <div className="rec__act">
              <a className="btn btn--cobalt" href={ls19Link(LS19_URL, o)} rel="noopener">{A.openLS19}<ArrowOut /></a>
              <p className="rec__actnote">{A.openLS19Note}</p>
            </div>
          </div>
          <div className="rec__model">
            <ModelViewer src={`/models/ast/${M.key}.glb`} label={A.viewer(o.name)} loading={A.viewerLoading} error={A.viewerError} hint={A.viewerHint}
              scaleLabel={A.scale} scaleValue={`${sig(lang, longest, 3)} ${A.km}`} />
          </div>
        </div>
        {o.neo || o.approaches.length ? (
          <section className="rec__sec" aria-labelledby="ca-h">
            <div className="sec__head"><h2 id="ca-h" className="sec__title">{A.ca.title}</h2></div>
            <Approaches lang={lang} list={o.approaches} cad={CAD} retrieved={RETRIEVED} headingId="ca-h" />
          </section>
        ) : null}
        {sen ? (
          <section className="rec__sec rec__risk" aria-labelledby="risk-h">
            <div className="sec__head"><h2 id="risk-h" className="sec__title">{R.title}</h2></div>
            {risk ? (<><p className="ca__lead">{R.listedLead}</p><ElementBlock rows={risk} /></>)
              : <p className="ca__lead">{sen.status === 'removed' ? R.removed(date(lang, sen.removed)) : R.none}</p>}
          </section>
        ) : null}
        <section className="rec__src" aria-labelledby="src-h">
          <h2 id="src-h" className="rec__srch">{A.sources}</h2>
          <ul>
            <li>{A.srcOrbit(date(lang, RETRIEVED))} <a href={`https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(o.des)}`} rel="noopener">JPL SBDB<ArrowOut size={11} /></a></li>
            {o.neo || o.approaches.length ? <li>{A.srcCad(date(lang, RETRIEVED))} <a href={`https://ssd-api.jpl.nasa.gov/cad.api?des=${encodeURIComponent(o.des)}&date-min=${CAD.range[0]}&date-max=${CAD.range[1]}&dist-max=${CAD.maxAu}`} rel="noopener">CAD API<ArrowOut size={11} /></a></li> : null}
            {sen ? <li>{A.srcSentry(date(lang, RETRIEVED))} <a href={`https://ssd-api.jpl.nasa.gov/sentry.api?des=${encodeURIComponent(o.des)}`} rel="noopener">Sentry API<ArrowOut size={11} /></a></li> : null}
            <li>{A.srcModel}: {M.source[lang]}. <Link href={`/${lang}/sources`}>{L.nav.sources}<ArrowRight size={11} /></Link></li>
          </ul>
        </section>
      </main>
      <Footer lang={lang} />
    </>
  );
}
