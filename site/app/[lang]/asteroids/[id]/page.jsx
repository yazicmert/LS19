// cisim kaydı: başlık (ad, gösterim, sınıf, bayraklar); yörünge ve fiziksel element blokları; gerçek şekil modeli (3B); LS19'da aç; kaynak satırları
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import ElementBlock from '@/components/ElementBlock';
import ModelViewer from '@/components/ModelViewer';
import { LANGS, LS19_URL } from '@/lib/config';
import { t, num, sig, date, clsName } from '@/lib/i18n';
import { OBJECTS, RETRIEVED, byId, auKm, ls19Link } from '@/lib/asteroids';
import { ArrowOut, ArrowRight } from '@/components/Icon';

export const dynamicParams = false;
export function generateStaticParams() { return LANGS.flatMap((lang) => OBJECTS.map((o) => ({ lang, id: o.id }))); }
export async function generateMetadata({ params }) {
  const { lang, id } = await params, o = byId(id); if (!o) return {};
  const A = t(lang).ast;
  return {
    title: o.name,
    description: `${o.fullname}: ${clsName(lang, o.orbitClass)}; a = ${num(lang, o.elements.a, 4)} au, e = ${num(lang, o.elements.e, 4)}, i = ${num(lang, o.elements.i, 2)}°. ${A.methodLong[o.model.method]}.`,
    alternates: { languages: { en: `/en/asteroids/${id}`, tr: `/tr/asteroids/${id}` } },
  };
}

export default async function Asteroid({ params }) {
  const { lang, id } = await params, o = byId(id); if (!o) notFound();
  const L = t(lang), A = L.ast, E = o.elements, P = o.phys, M = o.model, el = A.el;
  const moidKm = auKm(o.moid), longest = Math.max(...M.dims);
  const orbit = [
    ['a', el.a, num(lang, E.a, 6), 'au'],
    ['e', el.e, num(lang, E.e, 6), null],
    ['i', el.i, num(lang, E.i, 4), '°'],
    ['Ω', el.om, num(lang, E.om, 4), '°'],
    ['ω', el.w, num(lang, E.w, 4), '°'],
    ['M', el.ma, num(lang, E.ma, 4), '°'],
    ['q', el.q, num(lang, E.q, 6), 'au'],
    ['Q', el.ad, num(lang, E.ad, 6), 'au'],
    ['P', el.per, num(lang, E.per, 1), A.days],
    ['MOID', el.moid, sig(lang, o.moid, 4), moidKm != null && moidKm < 1e8 ? `au · ${num(lang, moidKm, 0)} ${A.km}` : 'au'],
  ];
  const phys = [
    ['H', el.H, num(lang, P.H, 2), null],
    ['D', el.D, sig(lang, P.diameter, 3), A.km],
    ['T', el.rot, P.rotPer != null ? num(lang, P.rotPer, P.rotPer < 10 ? 4 : 2) : null, A.hours],
    ['pᵥ', el.alb, P.albedo != null ? num(lang, P.albedo, 3) : null, null],
    ['', el.spec, [P.specB && `SMASS ${P.specB}`, P.specT && `Tholen ${P.specT}`].filter(Boolean).join(' · ') || null, null],
  ];
  const model = [
    ['', el.method, A.methodLong[M.method], null],
    ['', el.dims, M.dims.map((x) => sig(lang, x, 3)).join(' × '), A.km],
    ['', el.tris, num(lang, M.tris, 0), null],
    ['', el.src, M.source[lang], null],
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
        <section className="rec__src" aria-labelledby="src-h">
          <h2 id="src-h" className="rec__srch">{A.sources}</h2>
          <ul>
            <li>{A.srcOrbit(date(lang, RETRIEVED))} <a href={`https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(o.des)}`} rel="noopener">JPL SBDB<ArrowOut size={11} /></a></li>
            <li>{A.srcModel}: {M.source[lang]}. <Link href={`/${lang}/sources`}>{L.nav.sources}<ArrowRight size={11} /></Link></li>
          </ul>
        </section>
      </main>
      <Footer lang={lang} />
    </>
  );
}
