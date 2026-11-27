// uydu tablosu: sirkülerdeki gibi sabit genişlikli sütunlar; ad bağlantı, NORAD, işletmeci, fırlatma yılı, yörünge bölgesi, yükseklikler, eğiklik, dönem, kütle
import Link from 'next/link';
import { t, num } from '@/lib/i18n';
import { satName } from '@/lib/satellites';
import { SortTh } from './Filters';

// sort/onSort verilirse başlıklar sıralama düğmesi olur (SatBrowser)
export default function SatTable({ lang, sats, label, sort = null, onSort = null }) {
  const S = t(lang).sat, C = S.cols, F = t(lang).flt, H = (k, l, cls = '') => <SortTh k={k} label={l} sort={sort} onSort={onSort} className={cls} sortLabel={F.sortBy(l)} />;
  return (
    <div className="tbl" role="region" aria-label={label || S.title} tabIndex={0}>
      <table>
        <thead>
          <tr>
            {H('name', C.name)}
            {H('norad', C.norad, 'r')}
            {H('owner', C.owner)}
            {H('launched', C.launched, 'r')}
            {H('regime', C.regime)}
            {H('alt', C.alt, 'r')}
            {H('i', C.i, 'r')}
            {H('period', C.period, 'r')}
            {H('mass', C.mass, 'r')}
          </tr>
        </thead>
        <tbody>
          {sats.map((s) => (
            <tr key={s.id}>
              <th scope="row"><Link href={`/${lang}/satellites/${s.id}`}>{satName(s, lang)}</Link></th>
              <td className="r">{s.norad}</td>
              <td className="txt">{s.gcat && s.gcat.ownerShort.length ? s.gcat.ownerShort.join(' / ') : '—'}</td>
              <td className="r">{s.gcat && s.gcat.launch.date ? s.gcat.launch.date.iso.slice(0, 4) : '—'}</td>
              <td className="txt">{s.derived.regime}{s.derived.sso ? ' · SSO' : ''}</td>
              <td className="r">{num(lang, s.derived.perigee, 0)} × {num(lang, s.derived.apogee, 0)}</td>
              <td className="r">{num(lang, s.elements.i, 2)}</td>
              <td className="r">{num(lang, s.derived.period, 1)}</td>
              <td className="r">{s.gcat && s.gcat.mass != null ? num(lang, s.gcat.mass, 0) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
