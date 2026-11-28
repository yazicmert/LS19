// uydu istatistiği: 1957'den bu yana yörüngeye çıkan her yük (GCAT). Üstte başlık sayıları ve sınıf payları (sunucuda), altında gezgin
// (components/SatStats.jsx: zaman adımı, kırılım, süzgeçler, grafik/tablo, kırılım tablosu), en altta kaynak ve yöntem.
// Veri: data/satstats.json (scripts/uydu_istatistik.mjs, haftalık).
import Link from 'next/link';
import Masthead from '@/components/Masthead';
import Footer from '@/components/Footer';
import SatStats from '@/components/SatStats';
import DATA from '@/data/satstats.json';
import { pageMeta } from '@/lib/seo';
import { t, num, date } from '@/lib/i18n';
import { decode, headline, pct, CLASS_SLOTS, OTHER } from '@/lib/satstats';
import { ROCKETS } from '@/lib/rockets';

export async function generateMetadata({ params }) {
  const { lang } = await params, T = t(lang).sst;
  return pageMeta(lang, '/satellites/stats', { title: T.title, description: T.description });
}
const H = headline(decode(DATA));
const SHARE_ORDER = ['B', 'D', 'C', 'A', OTHER];
export default async function SatStatsPage({ params }) {
  const { lang } = await params, L = t(lang), T = L.sst, n0 = (x) => num(lang, x, 0);
  const monthName = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(H.month.y, H.month.m - 1, 1));
  const tiles = [
    [T.ytd(H.year), H.ytd, T.ytdSub(n0(H.ytdPrev), H.year - 1)],
    [T.lastY(H.lastYear), H.lastN, T.lastYSub(n0(H.perMonth), n0(H.perWeek))],
    [T.month(monthName), H.month.n, T.monthSub],
    [T.week(T.week2(H.week.y, H.week.w)), H.week.n, T.weekSub(date(lang, H.week.start), date(lang, H.week.end))],
    [T.all(H.firstYear), H.total, T.allSub(H.record.y, n0(H.record.n))],
  ];
  const clsName = (k) => (k === OTHER ? T.other : T.cls[k]);
  const shares = [['last', T.shareRow.last(H.lastYear), H.share.last], ['all', T.shareRow.all(H.firstYear), H.share.all]].map(([k, label, m]) => {
    const tot = SHARE_ORDER.reduce((s, c) => s + (m[c] || 0), 0);
    return { k, label, tot, parts: SHARE_ORDER.filter((c) => m[c]).map((c) => ({ c, n: m[c], f: m[c] / tot })) };
  });
  const rockets = Object.fromEntries(ROCKETS.map((v) => [v.name, v.slug]));
  return (
    <>
      <Masthead lang={lang} current="satellites" altPath="/satellites/stats" />
      <main id="main" className="wrap page">
        <nav className="crumb" aria-label="breadcrumb"><Link href={`/${lang}/satellites`}>{L.sat.title}</Link></nav>
        <h1 className="page__title">{T.title}</h1>
        <p className="page__lead">{T.lead}</p>

        <section className="rec__sec" aria-labelledby="sst-fig-h">
          <div className="sec__head"><h2 id="sst-fig-h" className="sec__title">{T.figT}</h2></div>
          <ul className="sst-tiles">
            {tiles.map(([label, v, sub]) => (
              <li key={label} className="sst-tile">
                <span className="sst-tile__l">{label}</span>
                <span className="sst-tile__v">{n0(v)}</span>
                <span className="sst-tile__s">{sub}</span>
              </li>
            ))}
          </ul>
          <p className="note">{T.asOf(date(lang, H.asOf))}</p>
        </section>

        <section className="rec__sec" aria-labelledby="sst-share-h">
          <div className="sec__head"><h2 id="sst-share-h" className="sec__title">{T.shareT}</h2></div>
          <p className="ca__lead">{T.shareLead}</p>
          {shares.map((s) => (
            <div key={s.k} className="sst-share">
              <p className="sst-share__l">{s.label}</p>
              <div className="sst-share__bar" role="img" aria-label={T.shareAria(s.label, s.parts.map((p) => `${clsName(p.c)} ${pct(lang, p.f)}`).join(', '))}>
                {s.parts.map((p) => (
                  <span key={p.c} className={`sst-share__p ${p.c === OTHER ? 'ser--o' : `ser--${CLASS_SLOTS[p.c]}`}`} style={{ flexGrow: p.n }} title={`${clsName(p.c)}: ${n0(p.n)} (${pct(lang, p.f)})`}>
                    {p.f >= 0.1 ? <span className="sst-share__t">{pct(lang, p.f)}</span> : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="tbl" role="region" aria-labelledby="sst-share-h" tabIndex={0}>
            <table>
              <thead><tr><th scope="col">{T.byO.cls}</th><th scope="col">{T.cols.code}</th>{shares.map((s) => <th key={s.k} scope="col" className="r" colSpan={2}>{s.label}</th>)}</tr></thead>
              <tbody>
                {SHARE_ORDER.map((c) => (
                  <tr key={c}>
                    <th scope="row" className="sst-bt__n"><span className={`sw ${c === OTHER ? 'ser--o' : `ser--${CLASS_SLOTS[c]}`}`} aria-hidden="true" />{clsName(c)}</th>
                    <td>{c === OTHER ? '—' : c}</td>
                    {shares.map((s) => [<td key={`${s.k}n`} className="r">{n0(s.parts.find((p) => p.c === c)?.n || 0)}</td>, <td key={`${s.k}f`} className="r">{pct(lang, (s.parts.find((p) => p.c === c)?.n || 0) / s.tot)}</td>])}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rec__sec" aria-labelledby="sst-x-h">
          <div className="sec__head"><h2 id="sst-x-h" className="sec__title">{T.exploreT}</h2></div>
          <SatStats lang={lang} rockets={rockets} />
        </section>

        <section className="rec__sec" aria-labelledby="sst-m-h">
          <div className="sec__head"><h2 id="sst-m-h" className="sec__title">{T.methodT}</h2></div>
          <dl className="sst-method">
            {T.method.map(([h, body]) => <div key={h}><dt>{h}</dt><dd>{body}</dd></div>)}
          </dl>
          <p className="note">{T.src(DATA.updated, date(lang, DATA.retrieved))}</p>
        </section>
      </main>
      <Footer lang={lang} />
    </>
  );
}
