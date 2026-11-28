'use client';
// roket kaydının kademe bölümü: metindeki kademe listesi düğmedir; seçilen kademe 3B görünümde vurgulanır ve yığın eksen boyunca ayrılır.
// "İçine gir" kesiti açar: tanklar, besleme hattı, motorlar ve kaynakta yazan parçalar; her parça düğmeyle de seçilir. Bilgi paneli
// yalnız kaynağı olan değerleri gösterir (GCAT ya da üretici/ajans belgesi; her satırın kaynak işareti). Durum adreste (?stage=1&view=inside).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t, num } from '@/lib/i18n';
import { readStageState, writeStageState } from '@/lib/rocket-detail';
import { RK_COLORS, PART_COLOR } from '@/lib/rocket3d';
import ElementBlock from './ElementBlock';
import RocketStage3D from './RocketStage3D';
import { ArrowOut } from './Icon';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const fmt = (lang, v, u) => num(lang, v, u === 't' ? (v < 10 ? 2 : 1) : u === 'kN' ? (v < 10 ? 2 : v < 100 ? 1 : 0) : u === 'm' ? (v < 10 ? 2 : 1) : u === 's' ? (v % 1 ? 1 : 0) : 0);

export default function RocketExplorer({ lang, name, spec, stages, dims, record, updated, retrieved }) {
  const L = t(lang), R = L.rk, X = R.x;
  const [st, setSt] = useState({ sel: null, view: 'whole', part: null }), [ready, setReady] = useState(false);
  const fig = useRef(null), panel = useRef(null);
  useEffect(() => { setSt(readStageState(window.location.search, stages)); setReady(true); }, [stages]);
  useEffect(() => {
    if (!ready) return;
    const u = `${window.location.pathname}${writeStageState(st)}${window.location.hash}`;
    if (u !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', u);
  }, [st, ready]);
  const S = st.sel ? stages.find((s) => s.key === st.sel) : null;
  const stageLabel = (s) => `${R.stage(s.no)}${s.mult > 1 ? ` × ${s.mult}` : ''}`;
  // dar ekranda görünüm metnin üstünde: seçimden sonra görünür değilse kaydırılır
  const reveal = () => {
    const el = fig.current; if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    if (r.bottom < 80 || r.top > window.innerHeight - 80) el.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };
  const choose = useCallback((key) => { setSt((s) => (s.sel === key && s.view !== 'inside' ? { sel: null, view: 'whole', part: null } : { sel: key, view: 'apart', part: null })); }, []);
  const onStage3D = useCallback((key) => setSt({ sel: key, view: 'apart', part: null }), []);
  const onPart3D = useCallback((id) => setSt((s) => ({ ...s, part: s.part === id ? null : id })), []);
  const status = st.view === 'inside' && S ? X.status.inside(stageLabel(S)) : S ? X.status.sel(stageLabel(S)) : st.view === 'apart' ? X.status.apart : X.status.whole;
  const partName = (id) => X.part[id] || id;
  const what = st.view === 'inside' && S ? X.whatInside(stageLabel(S), S.parts.map((p) => partName(p.id).toLowerCase()).join(', ')) : st.view === 'apart' ? X.whatApart : X.whatWhole;

  // kaynak işaretleri: G = GCAT; 1, 2… elle derlenmiş belgeler
  const srcNo = useMemo(() => (S ? Object.fromEntries(S.sources.map((s, k) => [s.id, String(k + 1)])) : {}), [S]);
  const tag = (ids) => (ids || []).map((i) => srcNo[i]).filter(Boolean).join(',');
  const propLabel = (p) => { const n = X.prop[p.key] || p.raw; return p.code && !n.includes(p.code) ? `${n} (${p.code})` : n; };
  const rows = useMemo(() => {
    if (!S) return [];
    const e = S.eng || {}, q = (k) => (S.q.includes(k) ? ' ?' : ''), out = [];
    const r = (k, v, u, unsureK, sub = null) => (v != null ? out.push(['G', X.rows[k], `${fmt(lang, v, u)}${unsureK ? q(unsureK) : ''}`, u === 's' ? X.u.s : u, null, sub]) : null);
    out.push(['G', X.rows.engine, S.cls === 'solid' ? S.engine || '—' : `${S.neng} × ${S.engine || '—'}`, null, 'text']);
    out.push(['G', X.rows.cls, X.cls[S.cls], null, 'text']);
    if (S.prop.length) out.push(['G', X.rows.prop, `${S.prop.map(propLabel).join(' + ')}${e.q && e.q.includes('prop') ? ' ?' : ''}`, null, 'text']);
    r('thrust', S.thrust, 'kN', 'thrust'); r('thrustSL', S.thrustSL, 'kN', 'thrustSL');
    if (e.isp != null) out.push(['G', e.ispSL ? X.rows.ispSL : X.rows.isp, `${num(lang, e.isp, e.isp % 1 ? 1 : 0)}${e.q && e.q.includes('isp') ? ' ?' : ''}`, X.u.s]);
    r('dur', S.dur ?? e.dur ?? null, 's');
    r('mass', S.mass, 't', 'mass'); if (S.dry != null) out.push(['G', X.rows.dry, `${num(lang, S.dry, 0)}${q('dry')}`, R.kg]);
    if (S.propMass != null) out.push(['G', X.rows.propMass, `${fmt(lang, S.propMass, 't')}${S.q.includes('dry') || S.q.includes('mass') ? ' ?' : ''}`, R.t, null, X.derived]);
    if (S.length != null && S.diameter != null) out.push(['G', X.rows.size, `${num(lang, S.length, 1)} × ${num(lang, S.diameter, 2)}${q('length') || q('diameter')}`, R.m]);
    if (e.chambers > 1) out.push(['G', X.rows.chambers, num(lang, e.chambers, 0), null]);
    // üretici/ajans değerleri: kaynak numarasıyla; GCAT satırıyla aynı adı taşırsa kaynağın adı eklenir
    for (const v of S.values) {
      const u = v.u === 's' ? X.u.s : v.u === 'tf' ? X.u.tf : v.u, by = (S.sources.find((x) => x.id === v.src) || {}).by;
      let lbl = `${X.rows[v.k === 'thrust' ? 'thrustAny' : v.k] || v.k}${v.per && v.per !== 'stage' ? ` (${X.per[v.per]})` : ''}`;
      if (out.some((o) => o[1] === lbl)) lbl = `${lbl} · ${by}`;
      out.push([srcNo[v.src] || '', lbl, fmt(lang, v.v, v.u), u]);
    }
    return out;
  }, [S, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const anyUnsure = rows.some((r) => / \?$/.test(String(r[2])));
  const P = S && st.part ? S.parts.find((p) => p.id === st.part) : null;
  const ctx = S ? { ox: S.eng && S.eng.ox ? propLabel(S.prop[0]) : null, fuel: S.prop.length ? propLabel(S.prop[S.prop.length - 1]) : null, n: S.neng, e: S.engine, ch: S.eng ? S.eng.chambers : 1 } : {};
  const factsFor = (id) => (S ? S.facts.filter((f) => f.part === id) : []);
  const tankLine = S ? (S.cls === 'liquid' ? (S.tanks.documented ? `${X.tanks[S.tanks.kind]}${S.tanks.order === 'ox-top' ? `; ${X.oxTop}` : ''}` : X.tanks.generic) : X.tanks[S.cls]) : null;

  return (
    <div className="rec__grid rkx">
      <div className="rec__data rkx__data">
        {dims}
        <div className="el rkx__st">
          <p className="el__cap">{R.stagesT}</p>
          <p className="rkx__lead">{X.lead}</p>
          <ul className="rkx__list">
            {stages.map((s) => (
              <li key={s.key}>
                <button type="button" className="rkx__btn" aria-expanded={st.sel === s.key} aria-controls="rkx-panel" onClick={() => { choose(s.key); reveal(); }}>
                  <span className="el__sym">{s.no}</span>
                  <span className="rkx__lbl">{stageLabel(s)}<span className="rkx__sub">{[s.name, s.neng && s.engine ? R.engines(s.neng, s.engine) : s.engine].filter(Boolean).join(' · ')}</span></span>
                  <span className="rkx__val">{s.length != null && s.diameter != null ? <>{num(lang, s.length, 1)} × {num(lang, s.diameter, 2)}<span className="el__unit">{R.m}</span></> : '—'}</span>
                </button>
                {st.sel === s.key ? (
                  <div id="rkx-panel" className="rkx__panel" ref={panel} role="region" aria-label={`${stageLabel(s)} · ${s.name || ''}`}>
                    <ElementBlock rows={rows} className="rkx__rows" />
                    {anyUnsure ? <p className="el__note">{X.unsure}</p> : null}
                    {s.no === '0' && s.mult > 1 ? <p className="el__note">{X.per.booster}</p> : null}
                    <p className="rkx__tank"><b>{X.rows.tanks}</b> {tankLine}{S.tanks.documented ? <sup className="rkx__ref">{tag(S.tanks.src)}</sup> : null}</p>
                    {st.view === 'inside' ? (
                      <div className="rkx__parts">
                        <p className="rkx__h">{X.parts}</p>
                        <p className="rkx__lead">{X.partsLead}</p>
                        <ul className="rkx__plist">
                          {S.parts.map((p) => (
                            <li key={p.id}>
                              <button type="button" className="rkx__pbtn" aria-pressed={st.part === p.id} onClick={() => setSt((x) => ({ ...x, part: x.part === p.id ? null : p.id }))}>
                                <span className="rkx__sw" style={{ background: hex(RK_COLORS[PART_COLOR[p.id] || 'part']) }} aria-hidden="true" />
                                {partName(p.id)}{p.n > 1 ? <span className="mono"> × {p.n}</span> : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                        {P ? (
                          <div className="rkx__pinfo" aria-live="polite">
                            <p className="rkx__h">{partName(P.id)}</p>
                            <p>{X.partText[P.id] ? X.partText[P.id](ctx) : ''}{P.src && P.src.length && !P.gen ? <sup className="rkx__ref">{tag(P.src)}</sup> : null}</p>
                            {factsFor(P.id).map((f, k) => <p key={k}>{f[lang] || f.en}<sup className="rkx__ref">{tag(f.src)}</sup></p>)}
                            {['engines', 'nozzle'].includes(P.id) && S.eng ? (
                              <p className="rkx__vals mono">{[S.eng.thrust != null ? `${fmt(lang, S.eng.thrust, 'kN')} ${R.kn} ${X.per.engine}` : null, S.eng.isp != null ? `Isp ${num(lang, S.eng.isp, S.eng.isp % 1 ? 1 : 0)} ${X.u.s}` : null].filter(Boolean).join(' · ')}<sup className="rkx__ref">G</sup></p>
                            ) : null}
                            {['gridfins', 'legs', 'fins', 'rcs', 'verniers', 'aerofins'].includes(P.id) ? <p className="rkx__lead">{P.n ? X.drawn(P.n) : X.textOnly}</p> : null}
                            {P.id === 'strakes' ? <p className="rkx__lead">{X.textOnly}</p> : null}
                            {P.gen || (P.id === 'engines' && !S.ringsDocumented) ? <p className="rkx__lead">{P.id === 'engines' ? X.genericEng : X.schem}</p> : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {S.facts.length && st.view !== 'inside' ? (
                      <div className="rkx__facts">
                        <p className="rkx__h">{X.facts}</p>
                        <ul>{S.facts.map((f, k) => <li key={k}>{f[lang] || f.en}<sup className="rkx__ref">{tag(f.src)}</sup></li>)}</ul>
                      </div>
                    ) : null}
                    <p className="el__note">{S.tanks.documented || S.cls !== 'liquid' ? X.schem : X.generic}</p>
                    <div className="rkx__src">
                      <p className="rkx__h">{X.srcT}</p>
                      <ol>
                        <li><span className="el__sym">G</span><span>{X.gcat(updated)} <a href="https://planet4589.org/space/gcat/web/lvs/stages/index.html" rel="noopener">GCAT<ArrowOut size={11} /></a></span></li>
                        {S.sources.map((x, k) => (
                          <li key={x.id}><span className="el__sym">{k + 1}</span><span>{x.by}, {x.t}; {X.retrieved(retrieved)} <a href={x.u} rel="noopener">{new URL(x.u).hostname.replace(/^www\./, '')}<ArrowOut size={11} /></a></span></li>
                        ))}
                      </ol>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        {record}
      </div>
      <div className="rec__model" ref={fig}>
        <RocketStage3D spec={spec} stages={stages} sel={st.sel} view={st.view} part={st.part} onStage={onStage3D} onPart={onPart3D}
          label={X.viewer(name, what)} loading={X.loading} error={X.error} hint={X.hint} scaleLabel={R.d.length} scaleValue={`${num(lang, spec.length, 1)} ${R.m}`} />
        <div className="rkx__bar" role="group" aria-label={R.stagesT}>
          <button type="button" className="rkx__tb" aria-pressed={st.view !== 'whole'} onClick={() => setSt((s) => (s.view === 'whole' ? { ...s, view: 'apart' } : { sel: null, view: 'whole', part: null }))}>{st.view === 'whole' ? X.apart : X.together}</button>
          <button type="button" className="rkx__tb" aria-pressed={st.view === 'inside'} disabled={!S} onClick={() => setSt((s) => (s.view === 'inside' ? { ...s, view: 'apart', part: null } : { ...s, view: 'inside', part: null }))}>{st.view === 'inside' ? X.outside : X.inside}</button>
          {!S ? <span className="rkx__pick">{X.pick}</span> : null}
        </div>
        <p className="rkx__status" role="status" aria-live="polite">{status}</p>
        <p className="el__note">{R.modelNote}</p>
      </div>
    </div>
  );
}
