// üs sayfası grafikleri (sunucuda SVG): yıllara göre fırlatmalar ve ulaşılan yörünge eğimleri. Tek seri, tek renk (kobalt); her çubuğun
// üzerine gelince değeri (title); aynı veri sayfadaki fırlatma listesinde de var.
import { num } from '@/lib/i18n';

const W = 720, H = 180, PL = 34, PB = 22, PT = 14;
export function YearBars({ lang, byYear, label }) {
  const ys = Object.keys(byYear).map(Number), y0 = Math.min(...ys), y1 = Math.max(...ys), n = y1 - y0 + 1, max = Math.max(...Object.values(byYear));
  const bw = (W - PL - 4) / n, sy = (v) => ((H - PB - PT) * v) / max, ticks = [0, Math.round(max / 2), max];
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((v) => <g key={v}><line x1={PL} x2={W} y1={H - PB - sy(v)} y2={H - PB - sy(v)} className="chart__grid" /><text x={PL - 6} y={H - PB - sy(v) + 4} textAnchor="end" className="chart__ax">{num(lang, v, 0)}</text></g>)}
        {Array.from({ length: n }, (_, k) => {
          const y = y0 + k, v = byYear[y] || 0;
          return (
            <g key={y}>
              {v ? <rect x={PL + 2 + k * bw + bw * 0.12} y={H - PB - sy(v)} width={Math.max(1, bw * 0.76)} height={sy(v)} className="chart__bar"><title>{`${y}: ${num(lang, v, 0)}`}</title></rect> : null}
              {y % 10 === 0 || n < 14 ? <text x={PL + 2 + k * bw + bw / 2} y={H - 6} textAnchor="middle" className="chart__ax">{y}</text> : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
export function InclBars({ lang, hist, lat, bin = 10, label }) {
  const n = hist.length, max = Math.max(1, ...hist), bw = (W - PL - 4) / n, sy = (v) => ((H - PB - PT) * v) / max, xLat = PL + 2 + (Math.abs(lat) / (n * bin)) * (W - PL - 4);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {[0, max].map((v) => <g key={v}><line x1={PL} x2={W} y1={H - PB - sy(v)} y2={H - PB - sy(v)} className="chart__grid" /><text x={PL - 6} y={H - PB - sy(v) + 4} textAnchor="end" className="chart__ax">{num(lang, v, 0)}</text></g>)}
        {hist.map((v, k) => (
          <g key={k}>
            {v ? <rect x={PL + 2 + k * bw + 1} y={H - PB - sy(v)} width={bw - 2} height={sy(v)} className="chart__bar"><title>{`${k * bin}°–${(k + 1) * bin}°: ${num(lang, v, 0)}`}</title></rect> : null}
            {k % 3 === 0 ? <text x={PL + 2 + k * bw} y={H - 6} textAnchor="middle" className="chart__ax">{k * bin}°</text> : null}
          </g>
        ))}
        <text x={W - 2} y={H - 6} textAnchor="end" className="chart__ax">180°</text>
        <line x1={xLat} x2={xLat} y1={PT - 6} y2={H - PB} className="chart__mark" />
        <text x={xLat + 5} y={PT + 2} className="chart__ml">φ = {num(lang, Math.abs(lat), 1)}°</text>
      </svg>
    </figure>
  );
}
