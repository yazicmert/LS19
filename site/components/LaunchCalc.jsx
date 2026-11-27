'use client';
// hesaplayıcı: üs ve hedef eğim → fırlatma azimutu, dönüşün katkısı, doğrudan ulaşılabilirlik, gereken düzlem değişimi, GTO → GEO.
// Bağıntılar lib/launchsite.js'te (sayfadaki açıklamalarla aynı).
import { useState } from 'react';
import { azimuthFor, rotBoost, minIncl, planeChange, gtoToGeo, inclFromAz, RANGES } from '@/lib/launchsite';
import { num, t } from '@/lib/i18n';

export default function LaunchCalc({ lang, sites }) {
  const C = t(lang).ls.calc, [slug, setSlug] = useState(sites[0].slug), [inc, setInc] = useState(51.6);
  const s = sites.find((x) => x.slug === slug) || sites[0], lat = s.lat, mi = minIncl(lat), ok = inc >= mi - 1e-9;
  const az = ok ? azimuthFor(lat, inc) : null, R = RANGES[slug], ir = R ? inclFromAz(lat, R.az) : null;
  const out = [
    [C.direct, ok ? C.yes : C.no(num(lang, mi, 1))],
    [C.azimuth, az == null ? '—' : `${num(lang, az, 1)}°`],
    [C.boost, `${num(lang, rotBoost(Math.min(inc, 180)), 0)} m/s`],
    [C.change, ok ? '0 m/s' : `≈ ${num(lang, planeChange(mi - inc), 0)} m/s (Δi = ${num(lang, mi - inc, 1)}°)`],
    [C.geo, `${num(lang, gtoToGeo(Math.max(mi, Math.min(inc, 90))), 0)} m/s`],
  ];
  return (
    <div className="calc">
      <div className="calc__in">
        <label className="calc__f"><span>{C.site}</span>
          <select value={slug} onChange={(e) => setSlug(e.target.value)}>{sites.map((x) => <option key={x.slug} value={x.slug}>{x.name} ({num(lang, Math.abs(x.lat), 1)}°)</option>)}</select>
        </label>
        <label className="calc__f"><span>{C.inc}: <b className="mono">{num(lang, inc, 1)}°</b></span>
          <input type="range" min="0" max="140" step="0.1" value={inc} onChange={(e) => setInc(+e.target.value)} />
        </label>
      </div>
      <dl className="calc__out">{out.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="mono">{v}</dd></div>)}</dl>
      <p className="note">{R ? C.range(num(lang, R.az[0], 1), num(lang, R.az[1], 1), num(lang, ir[0], 1), num(lang, ir[1], 1)) : C.noRange}</p>
    </div>
  );
}
