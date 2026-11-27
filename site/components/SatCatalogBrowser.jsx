'use client';
// tüm uydular (CelesTrak etkin kümesi, ~17 000): metin (ad, NORAD, COSPAR, işletmeci) ve yörünge/ülke/işletmeci/program süzgeçleri,
// sıralanabilir sütunlar, 50'lik sayfalar. Sorgular sitenin /api/sat ucuna gider; süzme ve sıralama sunucuda. Durum adreste:
// ?q=starlink&regime=LEO&state=US&sort=alt&dir=desc&page=3. 3B modeli olanlar işaretli ve zengin sayfalarına bağlı.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { t, num } from '@/lib/i18n';
import { useListState, FilterBar, FText, FSelect, FToggles, SortTh } from './Filters';

const DEF = { q: '', regime: '', state: '', owner: '', prog: '', sso: false, model: false, sort: 'norad', dir: 'asc', page: '0' };
const KEYS = ['q', 'regime', 'state', 'owner', 'prog', 'sort', 'dir', 'page'];
export default function SatCatalogBrowser({ lang, total }) {
  const L = t(lang), F = L.flt, C = L.satcat, K = C.cols, S = L.sat, [st, set, reset, dirty] = useListState(DEF);
  const [res, setRes] = useState(null), [facets, setFacets] = useState(null), [state, setState] = useState('loading'), [tick, setTick] = useState(0), ctl = useRef(null);
  const href = (r) => (r.M ? `/${lang}/satellites/${r.k}` : `/${lang}/sat/${r.k}`);
  useEffect(() => {
    const p = new URLSearchParams();
    for (const k of KEYS) if (st[k] && st[k] !== DEF[k]) p.set(k, k === 'q' ? st.q.trim() : st[k]);
    if (st.sso) p.set('sso', '1'); if (st.model) p.set('model', '1'); if (!facets) p.set('f', '1');
    const tm = setTimeout(() => {
      if (ctl.current) ctl.current.abort(); const c = new AbortController(); ctl.current = c; setState('loading');
      fetch(`/api/sat?${p}`, { signal: c.signal }).then((r) => r.json()).then((j) => { if (j.error) throw new Error(j.error); if (j.facets) setFacets(j.facets); setRes(j); setState('ready'); })
        .catch((e) => { if (e.name !== 'AbortError') setState('error'); });
    }, st.q.trim() ? 260 : 0);
    return () => clearTimeout(tm);
  }, [st.q, st.regime, st.state, st.owner, st.prog, st.sso, st.model, st.sort, st.dir, st.page, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (k, v) => { set(k, v); if (k !== 'page') set('page', '0'); };
  const onSort = (k) => { change('sort', k); set('dir', st.sort === k && st.dir === 'asc' ? 'desc' : 'asc'); };
  const pages = res ? Math.max(1, Math.ceil(res.count / 50)) : 1, page = res ? res.page : +st.page || 0;
  const sort = { key: st.sort, dir: st.dir }, H = (k, l, cls = '') => <SortTh k={k} label={l} sort={sort} onSort={onSort} className={cls} sortLabel={F.sortBy(l)} />;
  const fo = facets || { regimes: [], states: [], owners: [], progs: [], models: null };
  const go = (p) => set('page', String(p));
  return (
    <>
      <FilterBar label={F.title} shown={res ? res.count : 0} total={res ? res.total : total} onReset={reset} dirty={dirty} L={{ ...F, shown: (n, tt) => F.shown(num(lang, n, 0), num(lang, tt, 0)) }}>
        <FText label={C.find} value={st.q} onChange={(v) => change('q', v)} placeholder={C.ph} />
        <FSelect label={C.regime} value={st.regime} onChange={(v) => change('regime', v)} all={F.all} options={fo.regimes.map(([k, n]) => [k, S.regime[k], num(lang, n, 0)])} />
        <FSelect label={C.state} value={st.state} onChange={(v) => change('state', v)} all={F.all} options={fo.states.map(([k, l, n]) => [k, l, num(lang, n, 0)])} />
        <FSelect label={C.owner} value={st.owner} onChange={(v) => change('owner', v)} all={F.all} options={fo.owners.map(([k, l, n]) => [k, l, num(lang, n, 0)])} />
        <FSelect label={C.prog} value={st.prog} onChange={(v) => change('prog', v)} all={F.all} options={fo.progs.map(([k, l, n]) => [k, l, num(lang, n, 0)])} />
        <FToggles label={F.flags} items={[['sso', F.sso, st.sso, (v) => change('sso', v)], ['model', C.model, st.model, (v) => change('model', v)]]} />
      </FilterBar>
      {state === 'error' ? <p className="flt__none" role="status">{C.error} <button type="button" className="flt__reset" onClick={() => setTick((x) => x + 1)}>{C.retry}</button></p> : null}
      <div className={state === 'loading' ? 'cat is-loading' : 'cat'} aria-busy={state === 'loading'}>
        {state === 'loading' && !res ? <p className="flt__none" role="status">{C.loading}</p> : null}
        {res && res.rows.length ? (
          <>
            <div className="tbl" role="region" aria-label={C.title} tabIndex={0}>
              <table>
                <thead><tr>{H('norad', K.norad, 'r')}{H('name', K.name)}<th scope="col">{K.cospar}</th>{H('owner', K.owner)}{H('state', K.state)}{H('launched', K.launched, 'r')}{H('regime', K.regime)}{H('alt', K.alt, 'r')}{H('i', K.i, 'r')}{H('period', K.period, 'r')}{H('mass', K.mass, 'r')}</tr></thead>
                <tbody>
                  {res.rows.map((r) => (
                    <tr key={r.k}>
                      <td className="r">{r.k}</td>
                      <th scope="row"><Link href={href(r)}>{r.n}</Link>{r.M ? <span className="flag flag--sm" title={C.flag3d}>3D</span> : null}</th>
                      <td className="txt">{r.c || '—'}</td>
                      <td className="txt">{r.o.length ? r.o.join(' / ') : '—'}</td>
                      <td className="txt">{r.s || '—'}</td>
                      <td className="r">{r.y || '—'}</td>
                      <td className="txt">{r.r}{r.sso ? ' · SSO' : ''}</td>
                      <td className="r">{num(lang, r.hp, 0)} × {num(lang, r.ha, 0)}</td>
                      <td className="r">{num(lang, r.i, 2)}</td>
                      <td className="r">{num(lang, r.p, 1)}</td>
                      <td className="r">{r.m != null ? num(lang, r.m, 0) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="pager" aria-label={C.page(page + 1, pages)}>
              <button type="button" className="btn btn--ink" disabled={page <= 0} onClick={() => go(page - 1)}>{C.prev}</button>
              <span className="mono">{C.page(num(lang, page + 1, 0), num(lang, pages, 0))}</span>
              <button type="button" className="btn btn--ink" disabled={page + 1 >= pages} onClick={() => go(page + 1)}>{C.next}</button>
            </nav>
          </>
        ) : res ? <p className="flt__none">{F.none}</p> : null}
      </div>
      <p className="note">{C.liveNote}</p>
    </>
  );
}
