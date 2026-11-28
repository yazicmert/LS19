// roket kaydı: ölçüler, kademeler, fırlatma kaydı; ölçülerden çizilmiş 3B görünüm; ilk uçuştan bugüne her fırlatma (yıllara göre).
// Kademe listesi etkileşimli (components/RocketExplorer.jsx): seçilen kademe 3B'de ayrılır, kesiti açılır; kademe bilgisi GCAT ve data/rocket-detail.json'dan
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import ElementBlock from '@/components/ElementBlock';
import RocketExplorer from '@/components/RocketExplorer';
import { pageMeta } from '@/lib/seo';
import { LANGS } from '@/lib/config';
import { t, num } from '@/lib/i18n';
import { ROCKETS, RK_UPDATED, rocketBySlug } from '@/lib/rockets';
import { stageList } from '@/lib/rocket-detail';
import detail from '@/data/rocket-detail.json';
import { ArrowOut } from '@/components/Icon';

export const dynamicParams = false;
export function generateStaticParams() { return LANGS.flatMap((lang) => ROCKETS.map((v) => ({ lang, slug: v.slug }))); }
export async function generateMetadata({ params }) {
  const { lang, slug } = await params, v = rocketBySlug(slug); if (!v) return {};
  const R = t(lang).rk;
  return pageMeta(lang, `/rockets/${slug}`, { title: v.name, description: `${v.name}: ${num(lang, v.spec.length, 1)} m × ${num(lang, v.spec.diameter, 2)} m; ${R.r.total.toLowerCase()} ${v.stats.total}, ${R.r.success.toLowerCase()} ${v.stats.success} (${v.stats.first} – ${v.stats.last}).` });
}

export default async function Rocket({ params }) {
  const { lang, slug } = await params, v = rocketBySlug(slug); if (!v) notFound();
  const L = t(lang), R = L.rk, S = v.spec, St = v.stats;
  const dims = [
    ['', R.d.length, num(lang, S.length, 1), R.m],
    ['', R.d.diameter, num(lang, S.diameter, 2), R.m],
    S.launchMass != null ? ['', R.d.mass, num(lang, S.launchMass, 1), R.t] : null,
    S.thrust ? ['', R.d.thrust, num(lang, S.thrust, 0), R.kn] : null,
    S.leo ? ['', R.d.leo, num(lang, S.leo, 0), R.kg] : null,
    S.gto ? ['', R.d.gto, num(lang, S.gto, 0), R.kg] : null,
    v.family ? ['', R.family, v.family, null] : null,
    v.variant ? ['', R.variant, v.variant, null] : null,
  ];
  const stages = stageList(v, detail);
  const record = [
    ['', R.r.total, num(lang, St.total, 0), null],
    ['', R.r.success, num(lang, St.success, 0), null],
    ['', R.r.failure, num(lang, St.failure, 0), null],
    ['', R.r.rate, St.total ? `${num(lang, (100 * St.success) / St.total, 1)} %` : null, null],
    ['', R.r.first, St.first, null],
    ['', R.r.last, St.last, null],
  ];
  const years = []; for (const l of [...v.launches].reverse()) { const y = l.date.slice(0, 4); if (!years.length || years[years.length - 1][0] !== y) years.push([y, []]); years[years.length - 1][1].push(l); }
  const H = R.hcols;
  return (
    <>
      <Masthead lang={lang} current="rockets" altPath={`/rockets/${v.slug}`} />
      <main id="main" className="wrap rec">
        <nav className="crumb" aria-label="breadcrumb"><Link href={`/${lang}/rockets`}>{R.back(ROCKETS.length)}</Link></nav>
        <header className="rec__head">
          <h1 className="rec__title">{v.name}</h1>
          <p className="rec__des">{v.manufacturer.length ? <span>{v.manufacturer.join(' / ')}</span> : null}<span className="mono">{St.first?.slice(0, 4)} – {St.last?.slice(0, 4)}</span></p>
        </header>
        <RocketExplorer lang={lang} name={v.name} spec={S} stages={stages} updated={RK_UPDATED} retrieved={detail.retrieved}
          dims={<ElementBlock caption={R.dims} rows={dims} />} record={<ElementBlock caption={R.record} rows={record} />} />
        <section className="rec__sec" aria-labelledby="hist-h">
          <div className="sec__head"><h2 id="hist-h" className="sec__title">{R.hist}</h2></div>
          <p className="ca__lead">{R.histLead(St.total, St.first ? St.first.slice(0, 4) : '')}</p>
          {years.map(([y, ls], k) => (
            <details key={y} className="yr" open={k < 2}>
              <summary><span className="yr__y">{y}</span><span className="yr__n mono">{ls.length}{ls.some((l) => l.outcome === 'F') ? ` · ${ls.filter((l) => l.outcome === 'F').length} ${R.out.F.toLowerCase()}` : ''}</span></summary>
              <div className="tbl" role="region" aria-label={`${R.hist} ${y}`} tabIndex={0}>
                <table>
                  <thead><tr><th scope="col">{H.date}</th><th scope="col">{H.flight}</th><th scope="col">{H.mission}</th><th scope="col">{H.site}</th><th scope="col">{H.outcome}</th></tr></thead>
                  <tbody>
                    {ls.map((l) => (
                      <tr key={l.tag}>
                        <td>{l.date}{l.time ? ` ${l.time}` : ''}</td>
                        <td>{l.flight || '—'}</td>
                        <th scope="row" className="txt">{l.mission || '—'}</th>
                        <td className="txt">{[l.site, l.pad].filter(Boolean).join(' · ') || '—'}</td>
                        <td className="txt">{l.outcome === 'S' ? R.out.S : <span className={l.outcome === 'F' ? 'flag flag--ink' : 'flag'}>{R.out[l.outcome]}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </section>
        <section className="rec__src" aria-labelledby="src-h">
          <h2 id="src-h" className="rec__srch">{L.ast.sources}</h2>
          <ul>
            <li>{R.src(RK_UPDATED)} <a href="https://planet4589.org/space/gcat/" rel="noopener">GCAT<ArrowOut size={11} /></a></li>
            {[...new Map(stages.flatMap((x) => x.sources).map((x) => [x.id, x])).values()].map((x) => (
              <li key={x.id}>{x.by}, {x.t}; {R.x.retrieved(detail.retrieved)} <a href={x.u} rel="noopener">{new URL(x.u).hostname.replace(/^www\./, '')}<ArrowOut size={11} /></a></li>
            ))}
          </ul>
        </section>
      </main>
      <Footer lang={lang} />
    </>
  );
}
