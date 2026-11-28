'use client';
// uydu istatistiği gezgini: zaman adımı (yıl / ay / ISO haftası), kırılım (sınıf, görev, ülke, roket, işletmeci; ilk N + Diğer), süzgeçler
// (yıl aralığı, ülke, sınıf, görev, roket, işletmeci). Yığılmış çubuklar tek SVG'de seri başına bir yol; üzerine gelince ya da ok tuşlarıyla o
// dönemin bütün serileri ipucunda. Aynı sayılar tablo görünümünde ve altta sıralanabilir kırılım tablosunda. Durum adreste (paylaşılabilir).
// Renkler globals.css'teki --series-* simgelerinden (dataviz doğrulayıcısıyla iki temada denetlendi); renk varlığı izler, sırayı değil.
import { useEffect, useMemo, useRef, useState } from 'react';
import DATA from '@/data/satstats.json';
import { t, num, date } from '@/lib/i18n';
import { decode, aggregate, assignSlots, readState, writeState, isoWeek, isoOf, ymdOf, DIMS, TOPS, OTHER, MAIN_CLASSES, pct } from '@/lib/satstats';
import { useListState, FilterBar, FSelect, FToggles, SortTh } from './Filters';

const D = decode(DATA);
const FILTERS = ['cc', 'cls', 'mis', 'lv', 'op'];
const LOC = (lang) => (lang === 'tr' ? 'tr-TR' : 'en-GB');
// varlık adı: sınıf ve görev i18n'den (iki harfli ortak sınıf "Ticari + Savunma"), ülke dile göre, işletmeci GCAT kısa adı, roket olduğu gibi
export function nameOf(lang, by, k) {
  const T = t(lang).sst;
  if (k === OTHER) return T.other;
  if (by === 'cls') return T.cls[k] || k.split('').map((c) => T.cls[c] || c).join(' + ');
  if (by === 'mis') return T.mis[k] || k;
  const e = D.dims[by][D.idx[by].get(k)];
  if (!e) return k;
  return by === 'cc' ? e[lang] || e.en : by === 'op' ? e.n : k;
}
const fullOf = (by, k) => { if (by !== 'op') return null; const e = D.dims.op[D.idx.op.get(k)]; return e && e.f ? e.f : null; };
const ser = (slots, k) => (k === OTHER || !slots[k] ? 'ser--o' : `ser--${slots[k]}`);
function niceStep(x) { const p = 10 ** Math.floor(Math.log10(Math.max(1, x))), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }

function periodLabel(lang, res, key, long = false) {
  const T = t(lang).sst;
  if (res === 'year') return String(key);
  if (res === 'month') return new Intl.DateTimeFormat(LOC(lang), { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(Math.floor(key / 12), key % 12, 1));
  const w = isoWeek(D, key);
  return long ? `${T.week2(w.y, w.w)} · ${date(lang, isoOf(D, key))} – ${date(lang, isoOf(D, key + 6))}` : T.weekShort(w.y, w.w);
}

function Chart({ lang, agg, slots, T }) {
  const box = useRef(null), [W, setW] = useState(960), [act, setAct] = useState(null);
  useEffect(() => {
    const el = box.current; if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w > 0) setW(w); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => { setAct(null); }, [agg]);
  const { buckets, series, res } = agg, n = buckets.length, S = series.length;
  const direct = S >= 2 && S <= 4 && W >= 640;
  const H = W < 600 ? 260 : 340, PL = 46, PR = direct ? 150 : 10, PT = 14, PB = 28, plotW = Math.max(10, W - PL - PR), plotH = H - PT - PB;
  const bw = plotW / Math.max(1, n), barW = bw >= 4 ? Math.min(24, bw - Math.max(1, Math.min(10, bw * 0.3))) : bw;
  const max = Math.max(1, ...buckets.map((b) => b.total)), step = niceStep(max / 5), yMax = Math.ceil(max / step) * step;
  const y = (v) => PT + plotH * (1 - v / yMax);
  // yığın: en büyük seri altta, Diğer en üstte; parçalar arasında 2 px zemin boşluğu (çubuk 3 px'ten ince değilse); eksik dönem soluk
  const paths = useMemo(() => {
    const P = series.map(() => ['', '']);
    buckets.forEach((b, i) => {
      if (!b.total) return;
      const x = PL + i * bw + (bw - barW) / 2; let acc = 0;
      const top = b.vals.reduce((t2, v, j) => (v ? j : t2), -1);
      b.vals.forEach((v, j) => {
        if (!v) return;
        const y0 = y(acc), y1 = y(acc + v); acc += v;
        const gap = barW >= 3 && j !== top && y0 - y1 > 3 ? 2 : 0, h = Math.max(0.6, y0 - y1 - gap);
        P[j][b.partial ? 1 : 0] += `M${x.toFixed(2)} ${(y0 - h).toFixed(2)}h${barW.toFixed(2)}v${h.toFixed(2)}h${(-barW).toFixed(2)}z`;
      });
    });
    return P;
  }, [buckets, series, bw, barW, yMax, H]); // eslint-disable-line react-hooks/exhaustive-deps
  // x ekseni: yıl başları; etiketler en az ~48 px aralıklı, yılı 1, 2, 5, 10, 20 ya da 50'nin katı olanlar
  const ticks = useMemo(() => {
    const cand = [];
    buckets.forEach((b, i) => {
      if (res === 'year') cand.push([i, b.key]);
      else if (res === 'month' ? b.key % 12 === 0 : isoWeek(D, b.key).w === 1) cand.push([i, res === 'month' ? Math.floor(b.key / 12) : isoWeek(D, b.key).y]);
    });
    const per = res === 'year' ? 1 : res === 'month' ? 12 : 52.18, pxYear = bw * per, minPx = W < 600 ? 40 : 48;
    const st2 = [1, 2, 5, 10, 20, 50].find((s) => s * pxYear >= minPx) || 100;
    return cand.filter(([, yr]) => yr % st2 === 0);
  }, [buckets, res, bw, W]);
  const yt = []; for (let v = 0; v <= yMax; v += step) yt.push(v);
  const idxAt = (clientX) => { const r = box.current.getBoundingClientRect(), i = Math.floor((clientX - r.left - PL) / bw); return i >= 0 && i < n ? i : null; };
  const onKey = (e) => {
    if (!n) return;
    const k = e.key, cur = act == null ? n - 1 : act;
    const nx = k === 'ArrowLeft' ? Math.max(0, cur - 1) : k === 'ArrowRight' ? Math.min(n - 1, cur + 1) : k === 'Home' ? 0 : k === 'End' ? n - 1 : k === 'PageUp' ? Math.max(0, cur - 10) : k === 'PageDown' ? Math.min(n - 1, cur + 10) : k === 'Escape' ? null : undefined;
    if (nx === undefined) return;
    e.preventDefault(); setAct(nx);
  };
  const a = act != null ? buckets[act] : null, ax = act != null ? PL + act * bw + bw / 2 : 0;
  const rangeTxt = `${ymdOf(D, agg.lo).y}–${ymdOf(D, agg.hi).y}`;
  const live = a ? `${periodLabel(lang, res, a.key, true)}${a.partial ? ` (${T.partial})` : ''}: ${T.total} ${num(lang, a.total, 0)}; ${series.map((s, j) => (a.vals[j] ? `${nameOf(lang, agg.by, s.k)} ${num(lang, a.vals[j], 0)}` : null)).filter(Boolean).join(', ')}` : '';
  const last = (() => { for (let i = n - 1; i >= 0; i--) if (buckets[i].total) return i; return -1; })();
  return (
    <div className="sst-chart">
      {S >= 2 ? (
        <ul className="sst-leg" aria-label={T.legend}>
          {series.map((s) => <li key={s.k}><span className={`sw ${ser(slots, s.k)}`} aria-hidden="true" />{s.k === OTHER ? T.otherOf(num(lang, s.count, 0)) : nameOf(lang, agg.by, s.k)}</li>)}
        </ul>
      ) : null}
      <div ref={box} className="sst-chart__plot" tabIndex={0} role="group" aria-roledescription="chart" aria-label={T.chartAria(T.per[res], T.byN[agg.by], rangeTxt, num(lang, agg.total, 0))}
        onKeyDown={onKey} onFocus={() => setAct((v) => (v == null && n ? n - 1 : v))} onBlur={() => setAct(null)}
        onPointerMove={(e) => setAct(idxAt(e.clientX))} onPointerDown={(e) => setAct(idxAt(e.clientX))} onPointerLeave={(e) => { if (e.pointerType === 'mouse') setAct(null); }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          {yt.map((v) => <g key={v}><line x1={PL} x2={PL + plotW} y1={y(v)} y2={y(v)} className={v ? 'chart__grid' : 'sst-chart__base'} /><text x={PL - 7} y={y(v) + 4} textAnchor="end" className="chart__ax">{num(lang, v, 0)}</text></g>)}
          {a ? <rect x={PL + act * bw} y={PT - 6} width={Math.max(2, bw)} height={plotH + 6} className="sst-chart__hl" /> : null}
          {paths.map(([full, part], j) => (
            <g key={series[j].k} className={ser(slots, series[j].k)}>
              {full ? <path d={full} /> : null}
              {part ? <path d={part} className="is-partial" /> : null}
            </g>
          ))}
          {ticks.map(([i, yr]) => <g key={i}><line x1={PL + i * bw + bw / 2} x2={PL + i * bw + bw / 2} y1={PT + plotH} y2={PT + plotH + 4} className="sst-chart__base" /><text x={PL + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="chart__ax">{yr}</text></g>)}
          {direct && last >= 0 ? (() => {
            let acc = 0; const b = buckets[last], x = PL + last * bw + (bw + barW) / 2 + 8;
            return b.vals.map((v, j) => { const y0 = y(acc), y1 = y(acc + v); acc += v; return v && y0 - y1 >= 13 ? <text key={j} x={x} y={(y0 + y1) / 2 + 4} className="sst-chart__dl">{nameOf(lang, agg.by, series[j].k)}</text> : null; });
          })() : null}
        </svg>
        {a ? (
          <div className="sst-tip" style={ax > W / 2 ? { right: W - ax + 12 } : { left: ax + 12 }} aria-hidden="true">
            <p className="sst-tip__h">{periodLabel(lang, res, a.key, true)}{a.partial ? <span className="flag flag--sm">{T.partial}</span> : null}</p>
            <ul>
              {series.map((s, j) => (a.vals[j] ? <li key={s.k}><span className={`sst-tip__k ${ser(slots, s.k)}`} /><b className="mono">{num(lang, a.vals[j], 0)}</b><span>{nameOf(lang, agg.by, s.k)}</span></li> : null)).reverse()}
              <li className="sst-tip__t"><span className="sst-tip__k sst-tip__k--none" /><b className="mono">{num(lang, a.total, 0)}</b><span>{T.total}</span></li>
            </ul>
          </div>
        ) : null}
      </div>
      <p className="sst-vh" aria-live="polite">{live}</p>
      {buckets.some((b) => b.partial) ? <p className="note">{T.partialNote}</p> : null}
    </div>
  );
}

function ChartTable({ lang, agg, slots, T }) {
  const rows = [...agg.buckets].reverse();
  return (
    <div className="tbl sst-ctab" role="region" aria-label={T.chartTable(T.per[agg.res], T.byN[agg.by])} tabIndex={0}>
      <table>
        <caption className="sst-vh">{T.chartTable(T.per[agg.res], T.byN[agg.by])}</caption>
        <thead><tr><th scope="col">{T.cols.bucket}</th>{agg.series.map((s) => <th key={s.k} scope="col" className="r"><span className={`sw ${ser(slots, s.k)}`} aria-hidden="true" />{nameOf(lang, agg.by, s.k)}</th>)}<th scope="col" className="r">{T.total}</th></tr></thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.key}>
              <th scope="row" className="mono">{periodLabel(lang, agg.res, b.key)}{b.partial ? <span className="flag flag--sm">{T.partial}</span> : null}</th>
              {b.vals.map((v, j) => <td key={j} className="r">{num(lang, v, 0)}</td>)}
              <td className="r"><b>{num(lang, b.total, 0)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Breakdown({ lang, agg, slots, T, st, set, rockets }) {
  const [all, setAll] = useState(false);
  useEffect(() => { setAll(false); }, [agg.by]);
  const C = T.cols, by = agg.by, dir = st.dir === 'asc' ? 1 : -1;
  const rows = useMemo(() => {
    const r = agg.entities.map((x) => ({ ...x, name: nameOf(lang, by, x.k) }));
    const get = { n: (x) => x.n, name: (x) => x.name, first: (x) => x.first, last: (x) => x.last }[st.sort] || ((x) => x.n);
    return r.sort((p, q) => { const a2 = get(p), b2 = get(q); return dir * (typeof a2 === 'string' ? a2.localeCompare(b2, lang) : a2 - b2) || q.n - p.n; });
  }, [agg, by, lang, st.sort, dir]);
  const onSort = (k) => { set('sort', k); set('dir', st.sort === k ? (st.dir === 'asc' ? 'desc' : 'asc') : k === 'name' ? 'asc' : 'desc'); };
  const shown = all ? rows : rows.slice(0, 25), sort = { key: st.sort, dir: st.dir };
  const rangeTxt = `${ymdOf(D, agg.lo).y}–${ymdOf(D, agg.hi).y}`;
  return (
    <>
      <p className="ca__lead">{T.tableLead(T.byN[by], rangeTxt, num(lang, agg.total, 0))}</p>
      <div className="tbl" role="region" aria-label={T.tableT} tabIndex={0}>
        <table>
          <thead>
            <tr>
              <SortTh k="name" label={C.name} sort={sort} onSort={onSort} sortLabel={T.sortBy(C.name)} />
              {by !== 'lv' ? <th scope="col">{C.code}</th> : null}
              <SortTh k="n" label={C.n} sort={sort} onSort={onSort} className="r" sortLabel={T.sortBy(C.n)} />
              <th scope="col" className="r">{C.share}</th>
              <SortTh k="first" label={C.first} sort={sort} onSort={onSort} className="r" sortLabel={T.sortBy(C.first)} />
              <SortTh k="last" label={C.last} sort={sort} onSort={onSort} className="r" sortLabel={T.sortBy(C.last)} />
            </tr>
          </thead>
          <tbody>
            {shown.map((x) => {
              const href = by === 'lv' && rockets[x.k] ? `/${lang}/rockets/${rockets[x.k]}` : null, full = fullOf(by, x.k);
              return (
                <tr key={x.k}>
                  <th scope="row" className="sst-bt__n">
                    <span className={`sw ${ser(slots, x.k)}`} aria-hidden="true" />
                    {href ? <a href={href}>{x.name}</a> : x.name}
                    {full ? <span className="sst-bt__f">{full}</span> : null}
                  </th>
                  {by !== 'lv' ? <td>{x.k}</td> : null}
                  <td className="r">{num(lang, x.n, 0)}</td>
                  <td className="r">{pct(lang, x.n / agg.total)}</td>
                  <td className="r">{isoOf(D, x.first)}</td>
                  <td className="r">{isoOf(D, x.last)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 25 ? <p className="sst-more"><button type="button" className="flt__reset" onClick={() => setAll((v) => !v)} aria-expanded={all}>{all ? T.showLess : T.showAll(num(lang, rows.length, 0))}</button></p> : null}
    </>
  );
}

export default function SatStats({ lang, rockets }) {
  const L = t(lang), T = L.sst, [raw, set] = useListState(readState(''));
  const st = useMemo(() => readState(writeState(raw), D), [raw]);
  const agg = useMemo(() => aggregate(D, st), [st]);
  const memo = useRef({}), [weekMoved, setWeekMoved] = useState(false);
  const slots = useMemo(() => { const s = assignSlots(agg.by, agg.series.map((x) => x.k), memo.current[agg.by]); memo.current[agg.by] = s; return s; }, [agg]);
  const asOfY = ymdOf(D, D.asOfDay).y, y0 = ymdOf(D, D.minDay).y;
  const years = useMemo(() => { const r = []; for (let y = asOfY; y >= y0; y--) r.push([String(y), String(y)]); return r; }, [asOfY, y0]);
  const opts = useMemo(() => {
    const coll = new Intl.Collator(LOC(lang));
    const list = (k) => D.dims[k].map((e, i) => [e.k, nameOf(lang, k, e.k), D.counts[k][i]]);
    return {
      cls: [...MAIN_CLASSES.map((k) => list('cls').find((x) => x[0] === k)).filter(Boolean), ...list('cls').filter((x) => !MAIN_CLASSES.includes(x[0]))].map(([k, nm, c]) => [k, `${nm} · ${k}`, c]),
      mis: list('mis').map(([k, nm, c]) => [k, `${nm} · ${k}`, c]),
      cc: list('cc').sort((a, b) => coll.compare(a[1], b[1])).map(([k, nm, c]) => [k, `${nm} · ${k}`, c]),
      lv: list('lv').sort((a, b) => coll.compare(a[1], b[1])),
      op: list('op').sort((a, b) => coll.compare(a[1], b[1])).map(([k, nm, c]) => [k, nm === k ? nm : `${nm} · ${k}`, c]),
    };
  }, [lang]);
  const dirty = FILTERS.some((k) => st[k]) || !!st.from || !!st.to;
  const reset = () => { for (const k of [...FILTERS, 'from', 'to']) set(k, ''); setWeekMoved(false); };
  const setRes = (v) => {
    set('res', v);
    // haftalık görünüm bütün dönemde ~3.600 çubuk olur: başlangıç verilmemişse iki yıl öncesine alınır (adreste görünür, değiştirilebilir)
    if (v === 'week' && !st.from) { set('from', String(asOfY - 2)); setWeekMoved(true); } else setWeekMoved(false);
  };
  const F = { shown: (n, tot) => T.shown(num(lang, n, 0), num(lang, tot, 0)), reset: T.reset };
  return (
    <div className="sst">
      <div className="sst-ctl">
        <FToggles label={T.res} items={['year', 'month', 'week'].map((k) => [k, T.resO[k], st.res === k, () => setRes(k)])} />
        <FToggles label={T.by} items={DIMS.map((k) => [k, T.byO[k], st.by === k, () => set('by', k)])} />
        <FToggles label={T.top} items={TOPS.map((k) => [k, T.topO(k), st.top === k, () => set('top', k)])} />
        <FToggles label={T.view} items={['chart', 'table'].map((k) => [k, T.viewO[k], st.view === k, () => set('view', k)])} />
      </div>
      <FilterBar label={T.fltLabel} shown={agg.total} total={D.total} onReset={reset} dirty={dirty} L={F}>
        <FSelect label={T.from} value={st.from} onChange={(v) => { set('from', v); setWeekMoved(false); }} options={years} all={T.any} />
        <FSelect label={T.to} value={st.to} onChange={(v) => set('to', v)} options={years} all={T.any} />
        <FSelect label={T.byO.cc} value={st.cc} onChange={(v) => set('cc', v)} options={opts.cc} all={T.all2} />
        <FSelect label={T.byO.cls} value={st.cls} onChange={(v) => set('cls', v)} options={opts.cls} all={T.all2} />
        <FSelect label={T.byO.mis} value={st.mis} onChange={(v) => set('mis', v)} options={opts.mis} all={T.all2} />
        <FSelect label={T.byO.lv} value={st.lv} onChange={(v) => set('lv', v)} options={opts.lv} all={T.all2} />
        <FSelect label={T.byO.op} value={st.op} onChange={(v) => set('op', v)} options={opts.op} all={T.all2} />
      </FilterBar>
      {weekMoved ? <p className="note sst-wk">{T.weekNote}</p> : null}
      {!agg.total ? <p className="flt__none">{T.none}</p> : st.view === 'table' ? <ChartTable lang={lang} agg={agg} slots={slots} T={T} /> : <Chart lang={lang} agg={agg} slots={slots} T={T} />}
      <section className="rec__sec" aria-labelledby="sst-tbl-h">
        <div className="sec__head"><h2 id="sst-tbl-h" className="sec__title">{T.tableT}</h2></div>
        {agg.total ? <Breakdown lang={lang} agg={agg} slots={slots} T={T} st={st} set={set} rockets={rockets} /> : <p className="flt__none">{T.none}</p>}
      </section>
    </div>
  );
}
