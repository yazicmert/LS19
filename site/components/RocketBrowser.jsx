'use client';
// roket dizini: metin, üretici süzgeci; "en az 10 fırlatma" ve "başarısızlığı olan" düğmeleri; sütuna göre sıralama. Durum adreste
import { useMemo } from 'react';
import Link from 'next/link';
import { t, num } from '@/lib/i18n';
import { rank, sortBy } from '@/lib/search';
import { useListState, FilterBar, FText, FSelect, FToggles, SortTh } from './Filters';

const DEF = { q: '', maker: '', ten: false, fail: false, sort: 'total', dir: 'desc' };
const GET = { name: (v) => v.name, maker: (v) => v.maker.join('/'), total: (v) => v.total, rate: (v) => (v.total ? v.success / v.total : null), first: (v) => v.first, last: (v) => v.last, height: (v) => v.length, leo: (v) => v.leo };
export default function RocketBrowser({ lang, rows }) {
  const L = t(lang), F = L.flt, R = L.rk, C = R.cols, [st, set, reset, dirty] = useListState(DEF);
  const makers = useMemo(() => {
    const m = new Map(); for (const v of rows) for (const o of v.maker) m.set(o, (m.get(o) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([o, n]) => [o, o, n]);
  }, [rows]);
  const shown = useMemo(() => {
    const r = rows.filter((v) => (!st.maker || v.maker.includes(st.maker)) && (!st.ten || v.total >= 10) && (!st.fail || v.failure > 0));
    return st.q ? rank(r, st.q, (v) => [v.name, v.family, ...v.maker]) : sortBy(r, GET[st.sort] || GET.total, st.dir, lang);
  }, [rows, st, lang]);
  const onSort = (k) => { set('sort', k); set('dir', st.sort === k ? (st.dir === 'asc' ? 'desc' : 'asc') : (['name', 'maker'].includes(k) ? 'asc' : 'desc')); };
  const sort = st.q ? null : { key: st.sort, dir: st.dir }, H = (k, l, cls = '') => <SortTh k={k} label={l} sort={sort} onSort={onSort} className={cls} sortLabel={F.sortBy(l)} />;
  return (
    <>
      <FilterBar label={F.title} shown={shown.length} total={rows.length} onReset={reset} dirty={dirty} L={F}>
        <FText label={F.text} value={st.q} onChange={(v) => set('q', v)} placeholder={F.ph.rk} />
        <FSelect label={F.maker} value={st.maker} onChange={(v) => set('maker', v)} options={makers} all={F.all} />
        <FToggles label={F.flags} items={[['ten', F.minLaunches, st.ten, (v) => set('ten', v)], ['fail', F.failures, st.fail, (v) => set('fail', v)]]} />
      </FilterBar>
      {shown.length ? (
        <div className="tbl" role="region" aria-label={R.title} tabIndex={0}>
          <table>
            <thead><tr>{H('name', C.name)}{H('maker', C.maker)}{H('total', C.total, 'r')}{H('rate', C.rate, 'r')}{H('first', C.first, 'r')}{H('last', C.last, 'r')}{H('height', C.height, 'r')}{H('leo', C.leo, 'r')}</tr></thead>
            <tbody>
              {shown.map((v) => (
                <tr key={v.slug}>
                  <th scope="row"><Link href={`/${lang}/rockets/${v.slug}`}>{v.name}</Link></th>
                  <td className="txt">{v.maker.join(' / ') || '—'}</td>
                  <td className="r">{num(lang, v.total, 0)}</td>
                  <td className="r">{v.total ? `${num(lang, (100 * v.success) / v.total, v.success === v.total ? 0 : 1)} %` : '—'}</td>
                  <td className="r">{v.first ? v.first.slice(0, 4) : '—'}</td>
                  <td className="r">{v.last || '—'}</td>
                  <td className="r">{v.length != null ? num(lang, v.length, 1) : '—'}</td>
                  <td className="r">{v.leo != null ? num(lang, v.leo, 0) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="flt__none">{F.none}</p>}
    </>
  );
}
