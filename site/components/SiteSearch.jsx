'use client';
// site araması (künye bandında): ilk odakta /search.json dizini bir kez yüklenir; yazdıkça asteroitler, uydular ve sayfalar süzülür
// (Türkçe/İngilizce harf duyarsız, başlayan önce). Sorgu varken son satır yaklaşan fırlatmaları bu sorguyla süzer (/launches?q=).
// Klavye: ↑/↓ seçer, Enter açar, Esc kapatır. Combobox ARIA.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { t, clsName } from '@/lib/i18n';
import { rank } from '@/lib/search';

let index = null;                                                          // { promise, data }: sayfalar arası paylaşılır
const load = () => (index ? index.promise : (index = { promise: fetch('/search.json').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); }) }).promise);

export default function SiteSearch({ lang }) {
  const L = t(lang), S = L.search, id = useId(), router = useRouter(), box = useRef(null);
  const [q, setQ] = useState(''), [open, setOpen] = useState(false), [active, setActive] = useState(0), [data, setData] = useState(null), [state, setState] = useState('idle');
  const ensure = () => { if (data || state === 'loading') return; setState('loading'); load().then((d) => { setData(d); setState('ready'); }, () => { index = null; setState('error'); }); };
  const pages = useMemo(() => [
    ['/', L.home.title.split(' — ')[0]], ['/asteroids', L.ast.title], ['/satellites', L.sat.title], ['/rockets', L.rk.title], ['/launches', L.launch.title], ['/sources', L.src.title],
  ].map(([p, n]) => ({ id: p, n })), [L]);
  const groups = useMemo(() => {
    if (!q.trim() || !data) return [];
    const ast = rank(data.ast, q, (o) => [o.n, o.d, o.f, o.k != null ? String(o.k) : '']).slice(0, 5).map((o) => ({ href: `/${lang}/asteroids/${o.id}`, name: o.n, meta: clsName(lang, { code: o.c, name: o.cn }), num: o.k }));
    const sat = rank(data.sat, q, (s) => [s[lang], s.en, s.g, String(s.k), s.c, ...s.o]).slice(0, 5).map((s) => ({ href: `/${lang}/satellites/${s.id}`, name: s[lang], meta: s.r, num: s.k }));
    const rk = rank(data.rk || [], q, (v) => [v.n, v.f, ...v.m]).slice(0, 5).map((v) => ({ href: `/${lang}/rockets/${v.id}`, name: v.n, meta: v.m.join('/'), num: null }));
    const pg = rank(pages, q, (p) => [p.n]).slice(0, 3).map((p) => ({ href: `/${lang}${p.id === '/' ? '' : p.id}`, name: p.n, meta: '' }));
    return [['ast', ast], ['sat', sat], ['rk', rk], ['page', pg]].filter(([, r]) => r.length);
  }, [q, data, lang, pages]);
  const flat = useMemo(() => [...groups.flatMap(([, r]) => r), ...(q.trim() ? [{ href: `/${lang}/launches?q=${encodeURIComponent(q.trim())}`, name: S.launches(q.trim()), meta: '', action: true }] : [])], [groups, q, lang, S]);
  useEffect(() => { setActive(0); }, [q]);
  const go = (r) => { if (!r) return; setOpen(false); setQ(''); router.push(r.href); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(flat[active]); }
    else if (e.key === 'Escape') { if (q) setQ(''); else { setOpen(false); e.currentTarget.blur(); } }
  };
  const listed = open && q.trim() !== '';
  let k = -1;
  return (
    <div className="ss" ref={box} role="search">
      <label className="ss__label" htmlFor={`${id}-q`}>{S.label}</label>
      <svg className="ss__icon" width="15" height="15" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="6.8" cy="6.8" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M10.4 10.4 14.5 14.5" stroke="currentColor" strokeWidth="1.6" /></svg>
      <input id={`${id}-q`} type="search" value={q} placeholder={S.ph} autoComplete="off" spellCheck="false"
        role="combobox" aria-expanded={listed} aria-controls={`${id}-list`} aria-activedescendant={listed && flat[active] ? `${id}-o${active}` : undefined}
        onFocus={() => { ensure(); setOpen(true); }} onBlur={(e) => { if (!box.current.contains(e.relatedTarget)) setOpen(false); }}
        onChange={(e) => { setQ(e.target.value); setOpen(true); ensure(); }} onKeyDown={onKey} />
      {listed ? (
        <div className="ss__pop" id={`${id}-list`} role="listbox" aria-label={S.results(flat.length)}>
          {state === 'loading' && !data ? <p className="ss__msg" role="status">{S.loading}</p> : null}
          {state === 'error' ? <p className="ss__msg" role="status">{S.error}</p> : null}
          {data && !groups.length ? <p className="ss__msg" role="status">{S.none(q.trim())}</p> : null}
          {groups.map(([g, rows]) => (
            <div key={g} role="group" aria-label={S.groups[g]}>
              <p className="ss__grp" aria-hidden="true">{S.groups[g]}</p>
              {rows.map((r) => { k += 1; const me = k; return (
                <div key={r.href} id={`${id}-o${me}`} role="option" aria-selected={active === me} className={active === me ? 'ss__opt is-on' : 'ss__opt'}
                  onMouseEnter={() => setActive(me)} onMouseDown={(e) => { e.preventDefault(); go(r); }}>
                  <span className="ss__num">{r.num ?? ''}</span><span className="ss__name">{r.name}</span><span className="ss__meta">{r.meta}</span>
                </div>
              ); })}
            </div>
          ))}
          {flat.length && flat[flat.length - 1].action ? (() => { const me = flat.length - 1, r = flat[me]; return (
            <div id={`${id}-o${me}`} role="option" aria-selected={active === me} className={active === me ? 'ss__opt ss__opt--act is-on' : 'ss__opt ss__opt--act'}
              onMouseEnter={() => setActive(me)} onMouseDown={(e) => { e.preventDefault(); go(r); }}>
              <span className="ss__num" /><span className="ss__name">{r.name}</span><span className="ss__meta" />
            </div>
          ); })() : null}
        </div>
      ) : null}
    </div>
  );
}
