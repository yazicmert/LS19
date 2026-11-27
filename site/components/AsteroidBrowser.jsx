'use client';
// asteroit dizini: metin, yörünge sınıfı, şekil kaynağı ve bayrak süzgeçleri; sütuna göre sıralama. Durum adreste (?q=…&cls=APO&neo=1)
import { useMemo } from 'react';
import { t, clsName } from '@/lib/i18n';
import { rank, sortBy } from '@/lib/search';
import { shortName } from '@/lib/asteroids-match';
import AsteroidTable from './AsteroidTable';
import { useListState, FilterBar, FText, FSelect, FToggles } from './Filters';

const DEF = { q: '', cls: '', method: '', neo: false, pha: false, sentry: false, sort: 'num', dir: 'asc' };
const GET = {
  num: (o) => o.number, name: (o) => shortName(o), cls: (o) => o.orbitClass.code, a: (o) => o.elements.a, e: (o) => o.elements.e, i: (o) => o.elements.i,
  d: (o) => o.phys.diameter, moid: (o) => o.moid, method: (o) => o.model.method,
};
export default function AsteroidBrowser({ lang, rows }) {
  const L = t(lang), F = L.flt, A = L.ast, [st, set, reset, dirty] = useListState(DEF);
  const classes = useMemo(() => {
    const m = new Map(); for (const o of rows) m.set(o.orbitClass.code, [o.orbitClass, (m.get(o.orbitClass.code) || [null, 0])[1] + 1]);
    return [...m.values()].sort((x, y) => y[1] - x[1]).map(([c, n]) => [c.code, clsName(lang, c), n]);
  }, [rows, lang]);
  const shown = useMemo(() => {
    let r = rows.filter((o) => (!st.cls || o.orbitClass.code === st.cls) && (!st.method || o.model.method === st.method)
      && (!st.neo || o.neo) && (!st.pha || o.pha) && (!st.sentry || o.sentry === 'listed'));
    r = st.q ? rank(r, st.q, (o) => [o.name, o.des, o.fullname, o.number != null ? String(o.number) : '']) : sortBy(r, GET[st.sort] || GET.num, st.dir, lang);
    return r;
  }, [rows, st, lang]);
  const onSort = (k) => { set('sort', k); set('dir', st.sort === k && st.dir === 'asc' ? 'desc' : 'asc'); };
  return (
    <>
      <FilterBar label={F.title} shown={shown.length} total={rows.length} onReset={reset} dirty={dirty} L={F}>
        <FText label={F.text} value={st.q} onChange={(v) => set('q', v)} placeholder={F.ph.ast} />
        <FSelect label={F.cls} value={st.cls} onChange={(v) => set('cls', v)} options={classes} all={F.all} />
        <FSelect label={F.method} value={st.method} onChange={(v) => set('method', v)} all={F.all}
          options={['radar', 'spacecraft'].map((k) => [k, A.method[k], rows.filter((o) => o.model.method === k).length])} />
        <FToggles label={F.flags} items={[['neo', F.neo, st.neo, (v) => set('neo', v)], ['pha', F.pha, st.pha, (v) => set('pha', v)], ['sentry', F.sentry, st.sentry, (v) => set('sentry', v)]]} />
      </FilterBar>
      {shown.length ? <AsteroidTable lang={lang} objects={shown} full sort={st.q ? null : { key: st.sort, dir: st.dir }} onSort={onSort} /> : <p className="flt__none">{F.none}</p>}
    </>
  );
}
