// 33 cismin element tablosu: sirkülerdeki gibi sabit genişlikli sütunlar; ad bağlantı, sınıf, a/e/i, çap, MOID, şekil kaynağı
import Link from 'next/link';
import { t, num, sig, clsName } from '@/lib/i18n';
import { shortName } from '@/lib/asteroids-match';
import { SortTh } from './Filters';

// sort/onSort verilirse başlıklar sıralama düğmesi olur (AsteroidBrowser)
export default function AsteroidTable({ lang, objects, full = false, sort = null, onSort = null }) {
  const A = t(lang).ast, C = A.cols, F = t(lang).flt, H = (k, label, cls = '') => <SortTh k={k} label={label} sort={sort} onSort={onSort} className={cls} sortLabel={F.sortBy(label)} />;
  return (
    <div className="tbl" role="region" aria-label={t(lang).ast.title} tabIndex={0}>
      <table>
        <thead>
          <tr>
            {H('num', '#', 'tbl__num')}
            {H('name', C.name)}
            {H('cls', C.cls)}
            {H('a', C.a, 'r')}
            {H('e', C.e, 'r')}
            {H('i', C.i, 'r')}
            {H('d', C.d, 'r')}
            {full ? H('moid', C.moid, 'r') : null}
            {H('method', C.model)}
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
