'use client';
// süzgeç çubuğu parçaları: metin kutusu, seçim, aç/kapa düğmesi; altında "n / toplam" ve temizle. Durum sayfanın sahibinde (useListState)
import { useEffect, useId, useState } from 'react';
import { readParams, writeParams } from '@/lib/search';

// süzgeç durumu: ilk çizim varsayılanla (sunucudaki HTML ile aynı), açıldıktan sonra adres parametrelerinden; değişince adres güncellenir
export function useListState(defaults) {
  const [st, setSt] = useState(defaults), [ready, setReady] = useState(false);
  useEffect(() => { setSt(readParams(window.location.search, defaults)); setReady(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ready) return;
    const u = `${window.location.pathname}${writeParams(st, defaults)}${window.location.hash}`;
    if (u !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', u);
  }, [st, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setSt((s) => ({ ...s, [k]: v }));
  const reset = () => setSt((s) => ({ ...defaults, sort: s.sort, dir: s.dir }));
  const dirty = Object.keys(defaults).some((k) => k !== 'sort' && k !== 'dir' && st[k] !== defaults[k]);
  return [st, set, reset, dirty];
}

export function FilterBar({ label, children, shown, total, onReset, dirty, L }) {
  return (
    <div className="flt" role="search" aria-label={label}>
      <div className="flt__row">{children}</div>
      <p className="flt__meta" aria-live="polite">
        <span className="mono">{L.shown(shown, total)}</span>
        {dirty ? <button type="button" className="flt__reset" onClick={onReset}>{L.reset}</button> : null}
      </p>
    </div>
  );
}
export function FText({ label, value, onChange, placeholder }) {
  const id = useId();
  return (
    <div className="flt__f flt__f--text">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="search" value={value} placeholder={placeholder} autoComplete="off" spellCheck="false" onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
export function FSelect({ label, value, onChange, options, all }) {
  const id = useId();
  return (
    <div className="flt__f">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map(([v, t, n]) => <option key={v} value={v}>{n != null ? `${t} (${n})` : t}</option>)}
      </select>
    </div>
  );
}
export function FToggles({ label, items }) {
  return (
    <fieldset className="flt__f flt__f--tg">
      <legend>{label}</legend>
      <div className="flt__tgs">
        {items.map(([k, t, on, set]) => <button key={k} type="button" className="flt__tg" aria-pressed={on} onClick={() => set(!on)}>{t}</button>)}
      </div>
    </fieldset>
  );
}
// sıralanabilir sütun başlığı: düğme; aria-sort tablo başlığında
export function SortTh({ k, label, sort, onSort, className = '', sortLabel }) {
  if (!onSort) return <th scope="col" className={className}>{label}</th>;
  const on = sort && sort.key === k, dir = on ? sort.dir : null;
  return (
    <th scope="col" className={className} aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="th__sort" onClick={() => onSort(k)} aria-label={sortLabel}>
        {label}
        <svg className="th__dir" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
          {on ? <path d={dir === 'asc' ? 'M1 7l4-4 4 4' : 'M1 3l4 4 4-4'} fill="none" stroke="currentColor" strokeWidth="1.6" /> : <path d="M2 4l3-3 3 3M2 6l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />}
        </svg>
      </button>
    </th>
  );
}
