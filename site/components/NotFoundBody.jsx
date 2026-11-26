'use client';
// 404 gövdesi: bu sitede olmayan adres (bilinmeyen cisim, yanlış yol). 404 sayfası tek statik dosya (her adreste aynı, İngilizce);
// dil açıldıktan sonra yoldan okunur (/tr/… → Türkçe) ve belgenin lang'ına yazılır, böylece hidrasyon farkı olmaz;
// künye bandı iç sayfalarla aynı, sayı satırı yok. app/global-not-found.jsx ve app/[lang]/not-found.jsx kullanır
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isLang, t } from '@/lib/i18n';
import { ArrowRight } from '@/components/Icon';

export default function NotFoundBody() {
  const [lang, setLang] = useState('en'), L = t(lang);
  useEffect(() => { const seg = window.location.pathname.split('/')[1]; if (isLang(seg)) setLang(seg); }, []);
  useEffect(() => { document.documentElement.lang = lang; document.title = `${L.nf.title} · lookstar19`; }, [lang, L]);
  return (
    <>
      <header className="mast mast--compact">
        <a className="skip" href="#main">{L.skip}</a>
        <div className="wrap mast__in">
          <div className="mast__top"><Link href={`/${lang}`} className="mast__mark" aria-label="lookstar19">lookstar19</Link></div>
        </div>
      </header>
      <main id="main" className="wrap page nf">
        <h1 className="page__title">{L.nf.title}</h1>
        <p className="page__lead">{L.nf.body}</p>
        <p className="nf__links">
          <Link className="btn btn--ink" href={`/${lang}/asteroids`}>{L.nf.index}<ArrowRight /></Link>
          <Link className="lnk" href={`/${lang}`}>{L.nf.home}<ArrowRight /></Link>
        </p>
      </main>
    </>
  );
}
