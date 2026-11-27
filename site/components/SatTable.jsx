// uydu tablosu: sirkülerdeki gibi sabit genişlikli sütunlar; ad bağlantı, NORAD, işletmeci, fırlatma yılı, yörünge bölgesi, yükseklikler, eğiklik, dönem, kütle
import Link from 'next/link';
import { t, num } from '@/lib/i18n';
import { satName } from '@/lib/satellites';

export default function SatTable({ lang, sats, label }) {
  const S = t(lang).sat, C = S.cols;
  return (
    <div className="tbl" role="region" aria-label={label || S.title} tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">{C.name}</th>
            <th scope="col" className="r">{C.norad}</th>
            <th scope="col">{C.owner}</th>
            <th scope="col" className="r">{C.launched}</th>
            <th scope="col">{C.regime}</th>
            <th scope="col" className="r">{C.alt}</th>
            <th scope="col" className="r">{C.i}</th>
            <th scope="col" className="r">{C.period}</th>
            <th scope="col" className="r">{C.mass}</th>
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
