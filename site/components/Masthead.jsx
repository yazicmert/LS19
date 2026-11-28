// sirküler başlığı: kobalt bant; işaret ve ad, sayı ve tarih, gezinme satırı, renk teması, dil. size: 'full' (ana sayfa) | 'compact' (iç sayfalar)
import Link from 'next/link';
import { t, otherLang, date } from '@/lib/i18n';
import { ISSUE, LS19_URL } from '@/lib/config';
import { RETRIEVED } from '@/lib/asteroids';
import { ArrowOut } from './Icon';
import SiteSearch from './SiteSearch';
import Mark from './Mark';
import ThemeToggle from './ThemeToggle';

export default function Masthead({ lang, size = 'compact', current = null, altPath = '' }) {
  const L = t(lang), o = otherLang(lang), issue = String(ISSUE).padStart(4, '0');
  const nav = [['asteroids', `/${lang}/asteroids`], ['satellites', `/${lang}/satellites`], ['rockets', `/${lang}/rockets`], ['launches', `/${lang}/launches`], ['sites', `/${lang}/launches/sites`], ['sources', `/${lang}/sources`]];
  return (
    <header className={`mast mast--${size}`}>
      <a className="skip" href="#main">{L.skip}</a>
      <div className="wrap mast__in">
        <div className="mast__top">
          <Link href={`/${lang}`} className="mast__mark" aria-label="lookstar19"><Mark />lookstar19</Link>
          <p className="mast__issue">
            <span>{L.circular} {issue}</span>
            <span className="mast__date">{date(lang, RETRIEVED)}</span>
          </p>
        </div>
        <nav className="mast__nav" aria-label="lookstar19">
          <ul>
            {nav.map(([k, href]) => (
              <li key={k}><Link href={href} aria-current={current === k ? 'page' : undefined}>{L.nav[k]}</Link></li>
            ))}
            <li><a href={LS19_URL} rel="noopener">{L.nav.ls19}<ArrowOut size={12} /></a></li>
          </ul>
          <div className="mast__tools">
            <SiteSearch lang={lang} />
            <ThemeToggle lang={lang} />
            <Link className="mast__lang" href={`/${o}${altPath}`} hrefLang={o} lang={o}>{L.other}</Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
