import Link from 'next/link';
import { t, date } from '@/lib/i18n';
import { REPO_URL } from '@/lib/config';
import { RETRIEVED } from '@/lib/asteroids';
import { ArrowOut } from './Icon';

export default function Footer({ lang }) {
  const L = t(lang);
  return (
    <footer className="foot">
      <div className="wrap foot__in">
        <p className="foot__mark">lookstar19</p>
        <p className="foot__line">{L.footer.line}</p>
        <ul className="foot__links">
          <li><Link href={`/${lang}/sources`}>{L.nav.sources}</Link></li>
          <li><a href={REPO_URL} rel="noopener">{L.footer.repo}<ArrowOut size={11} /></a></li>
          <li className="foot__date">{L.footer.built(date(lang, RETRIEVED))}</li>
        </ul>
      </div>
    </footer>
  );
}
