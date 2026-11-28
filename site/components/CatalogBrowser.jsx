'use client';
// tüm asteroitler (JPL SBDB, ~1,6 milyon): metinle ön ekli arama ya da grup/sınıf/parlaklık süzgeçli, sıralı, 50'lik sayfalar.
// Sorgular sitenin /api/sb ucuna gider (o da JPL'e; bir gün önbellek). Durum adreste: ?group=pha&cls=APO&sort=H&page=3
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { t, num, sig, clsName } from '@/lib/i18n';
import { useListState, FilterBar, FText, FSelect, FToggles, SortTh } from './Filters';

const DEF = { q: '', group: '', cls: '', h: '', d: false, m3d: false, sort: 'num', dir: 'asc', page: '0' };
// şekil modeli olan cisimler (yerel veri, en çok birkaç düzine): süzgeç açıkken JPL'e sorulmaz; aynı süzgeçler ve sıralama burada uygulanır
const norm = (x) => String(x || '').toLowerCase();
function localList(rows, st) {
  const q = norm(st.q.trim()), h = st.h === '' ? null : +st.h, key = { num: 'spk', H: 'H', D: 'D', a: 'a', e: 'e', i: 'i', moid: 'moid', first: 'first' }[st.sort] || 'spk';
  const out = rows.filter((r) => (!q || [r.name, r.des, r.full, r.number != null ? String(r.number) : ''].some((x) => norm(x).startsWith(q) || norm(x).includes(` ${q}`)))
    && (!st.group || (st.group === 'neo' ? r.neo : r.pha)) && (!st.cls || r.cls === st.cls) && (h == null || (r.H != null && r.H <= h)) && (!st.d || r.D != null));
  const v = (r) => r[key], dir = st.dir === 'desc' ? -1 : 1;
  out.sort((a, b) => (v(a) == null) - (v(b) == null) || (v(a) < v(b) ? -dir : v(a) > v(b) ? dir : 0));
  return { count: out.length, rows: out.slice((+st.page || 0) * 50, (+st.page || 0) * 50 + 50) };
}
const CLASSES = ['MBA', 'IMB', 'OMB', 'APO', 'ATE', 'AMO', 'IEO', 'MCA', 'TJN', 'CEN', 'TNO', 'HYA'];
const slug = (des) => String(des).replace(/ /g, '_');
export default function CatalogBrowser({ lang, total, shapeIds, visited = {}, shapeRows = [] }) {
  const L = t(lang), F = L.flt, C = L.cat, K = C.cols, [st, set, reset, dirty] = useListState(DEF);
  const [res, setRes] = useState(null), [state, setState] = useState('loading'), [tick, setTick] = useState(0), ctl = useRef(null);
  const href = (des) => (shapeIds[des] ? `/${lang}/asteroids/${shapeIds[des]}` : `/${lang}/sb/${slug(des)}`);
  useEffect(() => {
    const q = st.q.trim(), p = new URLSearchParams();
    if (st.m3d) { if (ctl.current) ctl.current.abort(); setRes({ q: '', ...localList(shapeRows, st) }); setState('ready'); return undefined; }
    if (q) p.set('find', q); else { for (const k of ['group', 'cls', 'h', 'sort', 'dir', 'page']) if (st[k]) p.set(k, st[k]); if (st.d) p.set('d', '1'); }
    const tm = setTimeout(() => {
      if (ctl.current) ctl.current.abort(); const c = new AbortController(); ctl.current = c; setState('loading');
      fetch(`/api/sb?${p}`, { signal: c.signal }).then((r) => r.json()).then((j) => { if (j.error) throw new Error(j.error); setRes({ q, ...j }); setState('ready'); })
        .catch((e) => { if (e.name !== 'AbortError') setState('error'); });
    }, q ? 260 : 0);
    return () => clearTimeout(tm);
  }, [st.q, st.group, st.cls, st.h, st.d, st.m3d, st.sort, st.dir, st.page, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (k, v) => { set(k, v); if (k !== 'page') set('page', '0'); };
  const onSort = (k) => { change('sort', k); set('dir', st.sort === k && st.dir === 'asc' ? 'desc' : 'asc'); };
  const pages = res && !res.q ? Math.max(1, Math.ceil(res.count / 50)) : 1, page = +st.page || 0;
  const sort = { key: st.sort, dir: st.dir }, H = (k, l, cls = '') => <SortTh k={k} label={l} sort={sort} onSort={onSort} className={cls} sortLabel={F.sortBy(l)} />;
  const shown = res ? (res.q ? res.rows.length : res.count) : 0;
  return (
    <>
      <FilterBar label={F.title} shown={shown} total={total} onReset={reset} dirty={dirty} L={{ ...F, shown: (n, tt) => (res && res.q ? C.findNote(num(lang, n, 0)) : F.shown(num(lang, n, 0), num(lang, tt, 0))) }}>
        <FText label={C.find} value={st.q} onChange={(v) => change('q', v)} placeholder="Apophis, 433, 2024 YR4" />
        <FSelect label={C.group} value={st.group} onChange={(v) => change('group', v)} all={F.all} options={[['neo', C.groups.neo], ['pha', C.groups.pha]]} />
        <FSelect label={C.cls} value={st.cls} onChange={(v) => change('cls', v)} all={F.all} options={CLASSES.map((c) => [c, clsName(lang, { code: c, name: c })])} />
        <FSelect label={C.hmax} value={st.h} onChange={(v) => change('h', v)} all={F.all} options={['10', '15', '18', '22'].map((h) => [h, C.hOpt(h)])} />
        <FToggles label={F.flags} items={[['m3d', C.m3d, st.m3d, (v) => change('m3d', v)], ['d', C.dKnown, st.d, (v) => change('d', v)]]} />
      </FilterBar>
      {state === 'error' ? <p className="flt__none" role="status">{C.error} <button type="button" className="flt__reset" onClick={() => setTick((x) => x + 1)}>{C.retry}</button></p> : null}
      <div className={state === 'loading' ? 'cat is-loading' : 'cat'} aria-busy={state === 'loading'}>
        {state === 'loading' && !res ? <p className="flt__none" role="status">{C.loading}</p> : null}
        {res && res.q ? (
          res.rows.length ? (
            <ul className="cat__find">
              {res.rows.map((r) => <li key={r.des}><Link href={href(r.des)}>{r.full}</Link>{shapeIds[r.des] ? <span className="flag">{C.shape}</span> : null}{visited[r.des] ? <span className="flag flag--cobalt">{L.ms.short}</span> : null}</li>)}
            </ul>
          ) : <p className="flt__none">{F.none}</p>
        ) : res && res.rows.length ? (
          <>
            <div className="tbl" role="region" aria-label={C.title} tabIndex={0}>
              <table>
                <thead><tr>{H('num', K.num, 'tbl__num')}<th scope="col">{K.name}</th><th scope="col">{K.cls}</th>{H('H', K.H, 'r')}{H('D', K.D, 'r')}{H('a', K.a, 'r')}{H('e', K.e, 'r')}{H('i', K.i, 'r')}{H('moid', K.moid, 'r')}{H('first', K.first, 'r')}</tr></thead>
                <tbody>
                  {res.rows.map((r) => (
                    <tr key={r.spk}>
                      <td className="tbl__num">{r.number ?? ''}</td>
                      <th scope="row"><Link href={href(r.des)}>{r.name || r.des}</Link>{r.pha ? <span className="flag flag--ink flag--sm">PHA</span> : r.neo ? <span className="flag flag--sm">NEO</span> : null}{shapeIds[r.des] ? <span className="flag flag--sm">3D</span> : null}{visited[r.des] ? <span className="flag flag--sm flag--cobalt" title={L.ms.title}>{L.ms.short}</span> : null}</th>
                      <td className="txt">{clsName(lang, { code: r.cls, name: r.cls })}</td>
                      <td className="r">{r.H != null ? num(lang, r.H, 2) : '—'}</td>
                      <td className="r">{r.D != null ? sig(lang, r.D, 3) : '—'}</td>
                      <td className="r">{r.a != null ? num(lang, r.a, 3) : '—'}</td>
                      <td className="r">{r.e != null ? num(lang, r.e, 3) : '—'}</td>
                      <td className="r">{r.i != null ? num(lang, r.i, 2) : '—'}</td>
                      <td className="r">{r.moid != null ? sig(lang, r.moid, 3) : '—'}</td>
                      <td className="r">{r.first || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="pager" aria-label={C.page(page + 1, pages)}>
              <button type="button" className="btn btn--ink" disabled={page <= 0} onClick={() => set('page', String(page - 1))}>{C.prev}</button>
              <span className="mono">{C.page(num(lang, page + 1, 0), num(lang, pages, 0))}</span>
              <button type="button" className="btn btn--ink" disabled={page + 1 >= pages} onClick={() => set('page', String(page + 1))}>{C.next}</button>
            </nav>
          </>
        ) : res ? <p className="flt__none">{F.none}</p> : null}
      </div>
      <p className="note">{C.liveNote}</p>
    </>
  );
}
