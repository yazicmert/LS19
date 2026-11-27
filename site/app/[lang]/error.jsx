'use client';
// çalışma anı hatası (ör. katalog sayfası ilk kez üretilirken JPL yanıt vermedi): dil yoldan; yeniden dene düğmesi
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isLang, t } from '@/lib/i18n';

export default function Error({ reset }) {
  const [lang, setLang] = useState('en'), C = t(lang).cat;
  useEffect(() => { const s = window.location.pathname.split('/')[1]; if (isLang(s)) setLang(s); }, []);
  return (
    <main id="main" className="wrap page nf">
      <h1 className="page__title">{C.errTitle}</h1>
      <p className="page__lead">{C.errBody}</p>
      <p className="nf__links">
        <button type="button" className="btn btn--ink" onClick={() => reset()}>{C.retry}</button>
        <Link className="lnk" href={`/${lang}/asteroids/all`}>{C.back}</Link>
      </p>
    </main>
  );
}
