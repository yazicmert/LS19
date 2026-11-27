'use client';
// çalışma anı hatası (ör. katalog sayfası ilk kez üretilirken JPL ya da GP kopyası yanıt vermedi): dil ve katalog yoldan; yeniden dene düğmesi
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isLang, t } from '@/lib/i18n';

export default function Error({ reset }) {
  const [lang, setLang] = useState('en'), [sat, setSat] = useState(false), C = sat ? t(lang).satcat : t(lang).cat;
  useEffect(() => { const p = window.location.pathname.split('/'); if (isLang(p[1])) setLang(p[1]); setSat(p[2] === 'sat' || p[2] === 'satellites'); }, []);
  return (
    <main id="main" className="wrap page nf">
      <h1 className="page__title">{C.errTitle}</h1>
      <p className="page__lead">{C.errBody}</p>
      <p className="nf__links">
        <button type="button" className="btn btn--ink" onClick={() => reset()}>{C.retry}</button>
        <Link className="lnk" href={`/${lang}/${sat ? 'satellites' : 'asteroids'}/all`}>{C.back}</Link>
      </p>
    </main>
  );
}
