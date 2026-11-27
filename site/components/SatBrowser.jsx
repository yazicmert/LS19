'use client';
// uydu dizini: metin, yörünge bölgesi, işletmeci ve Güneş eşzamanlı süzgeçleri; sütuna göre sıralama. Durum adreste
import { useMemo } from 'react';
import { t } from '@/lib/i18n';
import { rank, sortBy } from '@/lib/search';
import { satName } from '@/lib/satellites';
import SatTable from './SatTable';
import { useListState, FilterBar, FText, FSelect, FToggles } from './Filters';

const DEF = { q: '', regime: '', owner: '', sso: false, sort: 'name', dir: 'asc' };
export default function SatBrowser({ lang, rows }) {
  const L = t(lang), F = L.flt, S = L.sat, [st, set, reset, dirty] = useListState(DEF);
  const GET = {
    name: (s) => satName(s, lang), norad: (s) => s.norad, owner: (s) => (s.gcat ? s.gcat.ownerShort.join('/') : null), launched: (s) => (s.gcat && s.gcat.launch.date ? s.gcat.launch.date.iso : null),
    regime: (s) => s.derived.regime, alt: (s) => s.derived.perigee, i: (s) => s.elements.i, period: (s) => s.derived.period, mass: (s) => (s.gcat ? s.gcat.mass : null),
  };
  const owners = useMemo(() => {
    const m = new Map(); for (const s of rows) for (const o of (s.gcat ? s.gcat.ownerShort : [])) m.set(o, (m.get(o) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([o, n]) => [o, o, n]);
  }, [rows]);
  const regimes = ['LEO', 'MEO', 'GEO', 'HEO', 'HIGH'].map((k) => [k, S.regime[k], rows.filter((s) => s.derived.regime === k).length]).filter((x) => x[2]);
  const shown = useMemo(() => {
    const r = rows.filter((s) => (!st.regime || s.derived.regime === st.regime) && (!st.sso || s.derived.sso) && (!st.owner || (s.gcat && s.gcat.ownerShort.includes(st.owner))));
    return st.q ? rank(r, st.q, (s) => [satName(s, lang), s.name, String(s.norad), s.cospar, ...(s.gcat ? [...s.gcat.ownerShort, ...s.gcat.owner] : [])]) : sortBy(r, GET[st.sort] || GET.name, st.dir, lang);
  }, [rows, st, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSort = (k) => { set('sort', k); set('dir', st.sort === k && st.dir === 'asc' ? 'desc' : 'asc'); };
  return (
    <>
      <FilterBar label={F.title} shown={shown.length} total={rows.length} onReset={reset} dirty={dirty} L={F}>
        <FText label={F.text} value={st.q} onChange={(v) => set('q', v)} placeholder={F.ph.sat} />
        <FSelect label={F.regime} value={st.regime} onChange={(v) => set('regime', v)} options={regimes} all={F.all} />
        <FSelect label={F.owner} value={st.owner} onChange={(v) => set('owner', v)} options={owners} all={F.all} />
        <FToggles label={F.flags} items={[['sso', F.sso, st.sso, (v) => set('sso', v)]]} />
      </FilterBar>
      {shown.length ? <SatTable lang={lang} sats={shown} sort={st.q ? null : { key: st.sort, dir: st.dir }} onSort={onSort} /> : <p className="flt__none">{F.none}</p>}
    </>
  );
}
