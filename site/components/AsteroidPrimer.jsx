// katalog sayfasında "Asteroitler hakkında": canlı sayılar (JPL SBDB Query), toplulukların yeri (logaritmik şerit), sınıf tablosu (her
// sınıf kataloğu o sınıfa süzer), Dünya'ya yakın ve tehlikeli tanımları, boyut–parlaklık, adlandırma, uzay araçlarının gittiği asteroitler.
import Link from 'next/link';
import { t, num, sig, date, clsName } from '@/lib/i18n';
import { STAT_CLASSES } from '@/lib/sbdb-live';
import { visitIndex } from '@/lib/missions';

const slug = (des) => String(des).replace(/ /g, '_');
export function PrimerStats({ lang, stats }) {
  const P = t(lang).pr, S = P.stats;
  return (
    <dl className="pr__stats">
      {['total', 'numbered', 'named', 'neo', 'pha', 'withD'].map((k) => <div key={k}><dt>{S[k]}</dt><dd className="mono">{num(lang, stats[k], 0)}</dd></div>)}
    </dl>
  );
}

// Güneş'ten 60 au'ya logaritmik şerit: gezegenler çizgi, asteroit toplulukları kobalt bant (yarı büyük eksen aralıkları, JPL sınıf sınırları)
const X0 = 0.3, X1 = 60, W = 720, PADL = 24, PADR = 16, lx = (au) => PADL + ((Math.log(au) - Math.log(X0)) / (Math.log(X1) - Math.log(X0))) * (W - PADL - PADR);
function BeltMap({ P }) {
  const Z = P.zones, bands = [
    [0.6, 1.3, Z.neo, 0.28], [2.0, 3.2, Z.belt, 0.85], [1.78, 2.0, null, 0.4], [3.2, 4.6, null, 0.4],
    [5.05, 5.36, Z.trojans, 0.85], [5.5, 30.1, Z.centaurs, 0.16], [30.1, 58, Z.tno, 0.5],
  ];
  return (
    <div className="pr__map" role="img" aria-label={P.map}>
      <svg viewBox={`0 0 ${W} 134`} width={W} height="134" aria-hidden="true" focusable="false">
        <line x1={PADL} x2={W - PADR} y1="70" y2="70" className="vz-ref" />
        <circle cx="10" cy="70" r="6" className="vz-sun" />
        {bands.map(([a, b, label, op], k) => (
          <g key={k}>
            <rect x={lx(a)} y="56" width={Math.max(2, lx(b) - lx(a))} height="28" className="pr__band" style={{ opacity: op }} />
            {label ? <text x={lx(Math.sqrt(a * b))} y="104" textAnchor="middle" className="pr__zl">{label}</text> : null}
          </g>
        ))}
        {P.planets.map(([n, au]) => (
          <g key={n}>
            <line x1={lx(au)} x2={lx(au)} y1="50" y2="90" className="pr__pl" />
            <text x={lx(au)} y="40" textAnchor="middle" className="pr__pn">{n}</text>
          </g>
        ))}
        {[0.5, 1, 2, 5, 10, 20, 50].map((au) => <text key={au} x={lx(au)} y="126" textAnchor="middle" className="pr__tick">{au} au</text>)}
      </svg>
    </div>
  );
}

export default function AsteroidPrimer({ lang, stats, missions, shapeIds }) {
  const L = t(lang), P = L.pr, Ms = L.ms, C = stats.cls, total = stats.total;
  const visits = visitIndex(missions, stats.retrieved), nMissions = missions.missions.length;
  const href = (des) => (shapeIds[des] ? `/${lang}/asteroids/${shapeIds[des]}` : `/${lang}/sb/${slug(des)}`);
  const pct = (n) => { const p = (100 * n) / total; return `${p >= 1 ? num(lang, p, 1) : sig(lang, p, 2)} %`; };
  return (
    <section className="pr" aria-labelledby="pr-h">
      <div className="sec__head"><h2 id="pr-h" className="sec__title">{P.title}</h2></div>
      <p className="pr__lead">{P.lead}</p>
      {stats.ok ? null : <p className="note">{P.fallback}</p>}

      <h3 className="pr__h">{P.whereT}</h3>
      <p className="pr__p">{P.whereLead}</p>
      <BeltMap P={P} />
      <div className="tbl" role="region" aria-label={P.whereT} tabIndex={0}>
        <table className="pr__cls">
          <thead><tr><th scope="col">{P.cols.cls}</th><th scope="col">{P.cols.def}</th><th scope="col" className="r">{P.cols.n}</th><th scope="col">{P.cols.share}</th></tr></thead>
          <tbody>
            {STAT_CLASSES.filter((c) => C[c] > 0).map((c) => {
              const name = clsName(lang, { code: c, name: c });
              return (
                <tr key={c}>
                  <th scope="row"><Link href={`/${lang}/asteroids?cls=${c}`} aria-label={P.filterLink(name)}>{name}</Link></th>
                  <td className="txt pr__def">{P.defs[c]}</td>
                  <td className="r">{num(lang, C[c], 0)}</td>
                  <td className="pr__sh"><span className="pr__bar" aria-hidden="true"><span style={{ width: `${Math.max(0.4, (100 * C[c]) / total)}%` }} /></span><span className="mono">{pct(C[c])}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="pr__cols">
        <div>
          <h3 className="pr__h">{P.neoT}</h3>
          <p className="pr__p">{P.neoBody(num(lang, stats.neo, 0), num(lang, stats.pha, 0))}</p>
          <p className="pr__p">{P.neoSizes(num(lang, stats.neo1km, 0), num(lang, stats.neo140m, 0))}</p>
          <p className="pr__links"><Link className="lnk" href={`/${lang}/asteroids?group=neo`}>{L.cat.groups.neo}</Link><Link className="lnk" href={`/${lang}/asteroids?group=pha`}>{L.cat.groups.pha}</Link></p>
        </div>
        <div>
          <h3 className="pr__h">{P.sizeT}</h3>
          <p className="pr__p">{P.sizeBody}</p>
          <p className="pr__formula mono">{P.sizeFormula}</p>
          <p className="pr__p">{P.sizeNote(num(lang, stats.withD, 0))}</p>
        </div>
        <div>
          <h3 className="pr__h">{P.nameT}</h3>
          {P.nameBody.map((x, k) => <p key={k} className="pr__p">{x}</p>)}
        </div>
      </div>

      <h3 className="pr__h" id="visits-h">{P.visitT}</h3>
      <p className="pr__p">{P.visitLead(num(lang, visits.length, 0), num(lang, nMissions, 0))}</p>
      <div className="tbl" role="region" aria-labelledby="visits-h" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">{P.visitCols.name}</th><th scope="col">{P.visitCols.role}</th><th scope="col">{P.visitCols.missions}</th><th scope="col" className="r">{P.visitCols.first}</th><th scope="col">{P.visitCols.status}</th></tr></thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.des}>
                <th scope="row"><Link href={href(v.des)}>{v.name}</Link>{v.name !== v.des ? <span className="pr__des mono">{v.des}</span> : null}</th>
                <td className="txt">{Ms.roles[v.role]}</td>
                <td className="txt">{[...new Set(v.missions)].join(', ')}</td>
                <td className="r">{v.first.slice(0, 4)}</td>
                <td className="txt"><span className={v.status === 'planned' ? 'flag flag--sm' : 'flag flag--sm flag--ink'}>{Ms.status[v.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">{Ms.note}</p>
      <p className="note">{P.srcLine(date(lang, stats.retrieved))}</p>
    </section>
  );
}
