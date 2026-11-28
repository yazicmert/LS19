'use client';
// yaklaşan fırlatmalar listesi: metin, sağlayıcı, durum süzgeçleri; "saati belli" ve "resmî yayın var" düğmeleri. Durum adreste
// (site araması "?q=" ile buraya yönlendirir). Liste sunucudaki sırayla (en erken önce) kalır. Her satır: görev (yük açıklanmadıysa açıkça
// "açıklanmadı"), tür ve hedef yörünge, müşteri ya da program, araç (itici seri no, uçuş sayısı, iniş), fırlatıcı ve ülkesi, rampa;
// başlık ve "Görev ayrıntıları" bağlantısı /launches/[id] sayfasına gider.
import { useMemo } from 'react';
import { t, netLabel, ll2tr } from '@/lib/i18n';
import { rank } from '@/lib/search';
import { countable } from '@/lib/launches';
import { useListState, FilterBar, FText, FSelect, FToggles } from './Filters';
import Link from 'next/link';
import { Play, ArrowRight } from './Icon';
import LaunchGlobe from './LaunchGlobe';
import { orbitGroup } from '@/lib/orbit-shapes';

const DEF = { q: '', provider: '', status: '', orbit: '', known: false, stream: false };
const groupOf = (abbrev) => (orbitGroup(abbrev) || { id: 'other' }).id;
const count = (rows, get) => { const m = new Map(); for (const r of rows) { const k = get(r); if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])); };
export default function LaunchBrowser({ lang, rows, globeRows = [] }) {
  const L = t(lang), F = L.flt, C = L.launch, [st, set, reset, dirty] = useListState(DEF);
  const providers = useMemo(() => count(rows, (l) => l.provider).map(([k, n]) => [k, k, n]), [rows]);
  const statuses = useMemo(() => count(rows, (l) => l.status.name || l.status.abbrev).map(([k, n]) => [k, k, n]), [rows]);
  const shown = useMemo(() => {
    const r = rows.filter((l) => (!st.provider || l.provider === st.provider) && (!st.status || (l.status.name || l.status.abbrev) === st.status)
      && (!st.orbit || groupOf(l.mission.orbitAbbrev) === st.orbit) && (!st.known || countable(l.precision)) && (!st.stream || l.streams.some((s) => s.official)));
    return st.q ? rank(r, st.q, (l) => [l.mission.name, l.name, l.vehicle, l.provider, l.pad.name, l.pad.location, l.mission.orbit, l.mission.type, ...l.mission.customers, ...l.programs, l.spacecraft]) : r;
  }, [rows, st]);
  return (
    <div className="lch__all">
      {globeRows.length ? <LaunchGlobe lang={lang} rows={globeRows} sel={st.orbit} onPick={(v) => set('orbit', v)} /> : null}
      <FilterBar label={F.title} shown={shown.length} total={rows.length} onReset={reset} dirty={dirty} L={F}>
        <FText label={F.text} value={st.q} onChange={(v) => set('q', v)} placeholder={F.ph.lch} />
        <FSelect label={F.provider} value={st.provider} onChange={(v) => set('provider', v)} options={providers} all={F.all} />
        <FSelect label={F.status} value={st.status} onChange={(v) => set('status', v)} options={statuses} all={F.all} />
        <FToggles label={F.flags} items={[['known', F.known, st.known, (v) => set('known', v)], ['stream', F.stream, st.stream, (v) => set('stream', v)]]} />
      </FilterBar>
      {shown.length ? (
        <ol className="lch__list">
          {shown.map((l) => {
            const s = l.streams.find((x) => x.official) || l.streams[0], b = l.booster, title = l.mission.name || C.unknownPayload;
            const who = l.mission.customers.length ? `${C.customer}: ${l.mission.customers.join(', ')}` : l.programs.length ? `${C.program}: ${l.programs.join(', ')}` : null;
            const boost = b && (b.serial || b.landing) ? [b.serial, b.flight ? (b.flight === 1 ? C.firstFlight : C.flightN(b.flight)) : null, b.landing === 'none' ? C.landingNone : b.landing && b.landing !== 'yes' ? `${b.landing}${b.landingAt ? ` → ${b.landingAt}` : ''}` : null].filter(Boolean).join(' · ') : null;
            return (
              <li key={l.id} className="lch__row">
                <p className="lch__net mono">{netLabel(lang, l.net, l.precision)}</p>
                <div className="lch__body">
                  <h2 className="lch__name"><Link className="lch__go" href={`/${lang}/launches/${l.id}`}>{title}</Link>{l.payload === 'unknown' ? <span className="flag flag--sm">TBD</span> : null}</h2>
                  {l.mission.type || l.mission.orbit ? <p className="lch__meta lch__tags">{l.mission.type ? <span>{ll2tr(lang, 'type', l.mission.type)}</span> : null}{l.mission.orbitAbbrev ? <span className="flag flag--sm" title={l.mission.orbit || undefined}>{l.mission.orbitAbbrev}</span> : l.mission.orbit ? <span>{l.mission.orbit}</span> : null}</p> : null}
                  {who ? <p className="lch__meta">{who}</p> : null}
                  <p className="lch__meta">{l.rocket ? <Link className="lch__rk" href={`/${lang}/rockets/${l.rocket}`}>{l.vehicle}</Link> : l.vehicle}{l.vehicle && l.provider ? ' · ' : ''}{l.provider}{l.providerCountry ? <span className="flag flag--sm">{l.providerCountry}</span> : null}</p>
                  {boost || l.spacecraft ? <p className="lch__meta">{[l.spacecraft ? `${l.spacecraft}${l.crew ? ` · ${C.crewOf(l.crew)}` : ''}` : null, boost].filter(Boolean).join(' · ')}</p> : null}
                  <p className="lch__meta">{[l.pad.name, l.pad.location].filter(Boolean).join(', ')}</p>
                </div>
                <div className="lch__side">
                  <p className="lch__status">{ll2tr(lang, 'status', l.status.abbrev, l.status.name) || l.status.abbrev}</p>
                  {s ? <a className="lnk" href={s.url} rel="noopener" target="_blank"><Play size={11} />{s.official ? C.watch : C.watchOther}</a> : <p className="lch__none">{C.noStream}</p>}
                  <Link className="lnk" href={`/${lang}/launches/${l.id}`} aria-label={C.detailsOf(title)}>{C.details}<ArrowRight size={11} /></Link>
                </div>
              </li>
            );
          })}
        </ol>
      ) : <p className="flt__none">{F.none}</p>}
    </div>
  );
}
