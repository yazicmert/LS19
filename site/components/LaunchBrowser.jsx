'use client';
// yaklaşan fırlatmalar listesi: metin, sağlayıcı, durum süzgeçleri; "saati belli" ve "resmî yayın var" düğmeleri. Durum adreste
// (site araması "?q=" ile buraya yönlendirir). Liste sunucudaki sırayla (en erken önce) kalır.
import { useMemo } from 'react';
import { t, netLabel } from '@/lib/i18n';
import { rank } from '@/lib/search';
import { countable } from '@/lib/launches';
import { useListState, FilterBar, FText, FSelect, FToggles } from './Filters';
import Link from 'next/link';
import { Play } from './Icon';

const DEF = { q: '', provider: '', status: '', known: false, stream: false };
const count = (rows, get) => { const m = new Map(); for (const r of rows) { const k = get(r); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
export default function LaunchBrowser({ lang, rows }) {
  const L = t(lang), F = L.flt, C = L.launch, [st, set, reset, dirty] = useListState(DEF);
  const providers = useMemo(() => count(rows, (l) => l.provider).map(([k, n]) => [k, k, n]), [rows]);
  const statuses = useMemo(() => count(rows, (l) => l.status.name || l.status.abbrev).map(([k, n]) => [k, k, n]), [rows]);
  const shown = useMemo(() => {
    const r = rows.filter((l) => (!st.provider || l.provider === st.provider) && (!st.status || (l.status.name || l.status.abbrev) === st.status)
      && (!st.known || countable(l.precision)) && (!st.stream || l.streams.some((s) => s.official)));
    return st.q ? rank(r, st.q, (l) => [l.mission.name, l.name, l.vehicle, l.provider, l.pad.name, l.pad.location, l.mission.orbit]) : r;
  }, [rows, st]);
  return (
    <div className="lch__all">
      <FilterBar label={F.title} shown={shown.length} total={rows.length} onReset={reset} dirty={dirty} L={F}>
        <FText label={F.text} value={st.q} onChange={(v) => set('q', v)} placeholder={F.ph.lch} />
        <FSelect label={F.provider} value={st.provider} onChange={(v) => set('provider', v)} options={providers} all={F.all} />
        <FSelect label={F.status} value={st.status} onChange={(v) => set('status', v)} options={statuses} all={F.all} />
        <FToggles label={F.flags} items={[['known', F.known, st.known, (v) => set('known', v)], ['stream', F.stream, st.stream, (v) => set('stream', v)]]} />
      </FilterBar>
      {shown.length ? (
        <ol className="lch__list">
          {shown.map((l) => {
            const s = l.streams.find((x) => x.official) || l.streams[0];
            return (
              <li key={l.id} className="lch__row">
                <p className="lch__net mono">{netLabel(lang, l.net, l.precision)}</p>
                <div className="lch__body">
                  <h2 className="lch__name">{l.mission.name || l.name}</h2>
                  <p className="lch__meta">{l.rocket ? <Link className="lch__rk" href={`/${lang}/rockets/${l.rocket}`}>{l.vehicle}</Link> : l.vehicle}{l.vehicle && l.provider ? ' · ' : ''}{l.provider}</p>
                  <p className="lch__meta">{[l.pad.name, l.pad.location].filter(Boolean).join(', ')}{l.mission.orbit ? ` · ${l.mission.orbit}` : ''}</p>
                </div>
                <div className="lch__side">
                  <p className="lch__status">{l.status.name || l.status.abbrev}</p>
                  {s ? <a className="lnk" href={s.url} rel="noopener" target="_blank"><Play size={11} />{s.official ? C.watch : C.watchOther}</a> : <p className="lch__none">{C.noStream}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      ) : <p className="flt__none">{F.none}</p>}
    </div>
  );
}
