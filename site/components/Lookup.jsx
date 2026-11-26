'use client';
// cisim bul: yazdıkça 33 cisim süzülür, seçilenin element bloğu hemen basılır (sirkülerin efemeris satırı gibi)
import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { t, num, sig, clsName } from '@/lib/i18n';
import { matchObjects, shortName } from '@/lib/asteroids-match';
import ElementBlock from './ElementBlock';
import { ArrowRight } from './Icon';

const FEATURED = ['apophis', 'bennu', 'ryugu', 'didymos', 'eros', 'itokawa'];        // boş kutuya odaklanınca önerilenler

export default function Lookup({ lang, objects, initial = 'apophis' }) {
  const L = t(lang), A = L.ast, router = useRouter(), id = useId();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(initial);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => (q ? matchObjects(objects, q) : FEATURED.map((k) => objects.find((o) => o.id === k)).filter(Boolean)).slice(0, 6), [objects, q]);
  const listed = open && hits.length > 0, pick = active >= 0 ? hits[active] : q ? hits[0] : null;
  const cur = objects.find((o) => o.id === (pick ? pick.id : sel)) || null;
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && cur && (q || active >= 0)) { e.preventDefault(); router.push(`/${lang}/asteroids/${cur.id}`); }
    else if (e.key === 'Escape') { setQ(''); setActive(-1); setOpen(false); }
  };
  const rows = cur ? [
    ['a', A.el.a, num(lang, cur.a, 4), 'au'],
    ['e', A.el.e, num(lang, cur.e, 4), null],
    ['i', A.el.i, num(lang, cur.i, 2), '°'],
    ['P', A.el.per, num(lang, cur.per / 365.25, 2), A.years],
    ['MOID', A.el.moid, sig(lang, cur.moid, 3), 'au'],
    ['D', A.el.D, sig(lang, cur.D, 3), A.km],
  ] : [];
  return (
    <div className="look">
      <label className="look__label" htmlFor={`${id}-q`}>{L.home.findLabel}</label>
      <div className="look__field">
        <input id={`${id}-q`} type="search" value={q} autoComplete="off" spellCheck="false" placeholder={L.home.findHint}
          role="combobox" aria-expanded={listed ? 'true' : 'false'} aria-controls={`${id}-list`} aria-activedescendant={listed && pick ? `${id}-${pick.id}` : undefined}
          onChange={(e) => { setQ(e.target.value); setActive(-1); setOpen(true); }} onKeyDown={onKey} onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }} />
      </div>
      {open && (q || listed) ? (
        hits.length ? (
          <ul className="look__list" id={`${id}-list`} role="listbox" aria-label={L.home.results(hits.length)}>
            {hits.map((o, k) => (
              <li key={o.id} id={`${id}-${o.id}`} role="option" aria-selected={pick === o} className={pick === o ? 'is-on' : ''}
                onMouseEnter={() => setActive(k)} onMouseDown={(e) => { e.preventDefault(); setSel(o.id); setQ(''); setActive(-1); setOpen(false); e.currentTarget.closest('.look').querySelector('input').blur(); }}>
                <span className="look__num">{o.number ?? ''}</span><span className="look__name">{shortName(o)}</span>
                <span className="look__cls">{clsName(lang, o.cls)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="look__none" role="status">{L.home.noMatch(q)}</p>
      ) : null}
      {cur ? (
        <section className="look__rec" aria-live="polite" key={cur.id}>
          <header className="look__head">
            <h2 className="look__title">{cur.name}</h2>
            <p className="look__meta">
              <span>{clsName(lang, cur.cls)}</span>
              {cur.neo ? <span className="flag">{A.flags.neo}</span> : null}
              {cur.pha ? <span className="flag flag--ink">{A.flags.pha}</span> : null}
            </p>
          </header>
          <ElementBlock rows={rows} className="el--print" />
          <Link className="btn btn--ink" href={`/${lang}/asteroids/${cur.id}`}>{L.home.openPage}<ArrowRight /></Link>
        </section>
      ) : null}
    </div>
  );
}
