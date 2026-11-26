// 33 cismin element tablosu: sirkülerdeki gibi sabit genişlikli sütunlar; ad bağlantı, sınıf, a/e/i, çap, MOID, şekil kaynağı
import Link from 'next/link';
import { t, num, sig, clsName } from '@/lib/i18n';
import { shortName } from '@/lib/asteroids-match';

export default function AsteroidTable({ lang, objects, full = false }) {
  const A = t(lang).ast, C = A.cols;
  return (
    <div className="tbl" role="region" aria-label={t(lang).ast.title} tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col" className="tbl__num">#</th>
            <th scope="col">{C.name}</th>
            <th scope="col">{C.cls}</th>
            <th scope="col" className="r">{C.a}</th>
            <th scope="col" className="r">{C.e}</th>
            <th scope="col" className="r">{C.i}</th>
            <th scope="col" className="r">{C.d}</th>
            {full ? <th scope="col" className="r">{C.moid}</th> : null}
            <th scope="col">{C.model}</th>
          </tr>
        </thead>
        <tbody>
          {objects.map((o) => (
            <tr key={o.id}>
              <td className="tbl__num">{o.number ?? ''}</td>
              <th scope="row"><Link href={`/${lang}/asteroids/${o.id}`}>{shortName(o)}</Link>{o.pha ? <span className="flag flag--ink flag--sm" title={A.flags.pha}>PHA</span> : null}</th>
              <td className="txt">{clsName(lang, o.orbitClass)}</td>
              <td className="r">{num(lang, o.elements.a, 4)}</td>
              <td className="r">{num(lang, o.elements.e, 4)}</td>
              <td className="r">{num(lang, o.elements.i, 2)}</td>
              <td className="r">{sig(lang, o.phys.diameter, 3) ?? '—'}</td>
              {full ? <td className="r">{sig(lang, o.moid, 3)}</td> : null}
              <td className="txt">{A.method[o.model.method]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
