// tarihçe: tarih (eş aralıklı) · işaret · olay ve kaynağı. Görev olayları kobalt kare, veri olayları mürekkep, planlananlar boş kare;
// geçmişle gelecek arasında "bugün" çizgisi. Tarih kaynağın kesinliğinde (gün, ay, yıl).
import { t } from '@/lib/i18n';

const CRAFT = new Set(['flyby', 'orbit', 'landing', 'sample', 'impact', 'depart', 'end', 'launch', 'service', 'crew', 'planned']);
const fmt = (e) => (e.prec === 'year' ? e.date.slice(0, 4) : e.prec === 'month' ? e.date.slice(0, 7) : e.date) + (e.time ? ` ${e.time}` : '');
export default function Timeline({ lang, events, today, headingId }) {
  const H = t(lang).hist, cut = events.findIndex((e) => e.future);
  const items = cut < 0 ? events : [...events.slice(0, cut), { now: true }, ...events.slice(cut)];
  return (
    <ol className="tl" aria-labelledby={headingId}>
      {items.map((e, k) => (e.now ? (
        <li key="now" className="tl__now"><span className="tl__date mono">{today}</span><span className="tl__mark" aria-hidden="true" /><span className="tl__body">{H.now}</span></li>
      ) : (
        <li key={k} className={`tl__ev tl__ev--${CRAFT.has(e.kind) ? 'craft' : 'data'}${e.future ? ' tl__ev--future' : ''}`}>
          <span className="tl__date mono">{fmt(e)}</span>
          <span className="tl__mark" aria-hidden="true" />
          <span className="tl__body">
            <span className="tl__text">{e.text}{e.future && e.kind === 'planned' ? <span className="flag tl__flag">{H.planned}</span> : null}</span>
            <span className="tl__src">{e.mission ? `${e.mission} · ` : ''}{e.src}</span>
          </span>
        </li>
      )))}
    </ol>
  );
}
