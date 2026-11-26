// Dünya'ya yakın geçişler (JPL CAD): dönem özeti, sıradaki geçişler tablosu (verinin alındığı güne göre), dönemin en yakını ve en son geçiş.
// Uzaklık merkezden merkeze; ± sütunu 3σ uzaklık aralığının yarısı (km); zaman belirsizliği 3σ (kaynağın biçiminden).
import { t, num, sig, tSigma } from '@/lib/i18n';
import { AU_KM, LD_AU, splitApproaches } from '@/lib/jpl';

const SHOW = 6;
function Row({ lang, c, tag }) {
  return (
    <tr>
      <th scope="row" className="mono">{c.date.replace('T', ' ')}{tag ? <span className="ca__tag">{tag}</span> : null}</th>
      <td className="r">{sig(lang, c.dist, 4)}</td>
      <td className="r">{num(lang, c.dist * AU_KM, 0)}</td>
      <td className="r">{num(lang, c.dist / LD_AU, 2)}</td>
      <td className="r">{num(lang, ((c.distMax - c.distMin) / 2) * AU_KM, 0)}</td>
      <td className="r">{num(lang, c.vRel, 2)}</td>
      <td className="r">{tSigma(lang, c.tSigma)}</td>
    </tr>
  );
}
export default function Approaches({ lang, list, cad, retrieved, headingId }) {
  const A = t(lang).ast.ca, C = A.cols, [from, to] = cad.range.map((d) => d.slice(0, 4));
  if (!list.length) return <p className="ca__lead">{A.none(num(lang, cad.maxAu, 1), from, to)}</p>;
  const { past, next } = splitApproaches(list, retrieved);
  const closest = list.reduce((m, c) => (c.dist < m.dist ? c : m), list[0]), last = past[past.length - 1];
  const shown = next.slice(0, SHOW), extra = [closest, last].filter((c, i, a) => c && !shown.includes(c) && a.indexOf(c) === i);
  return (
    <>
      <p className="ca__lead">{A.lead(list.length, num(lang, cad.maxAu, 1), from, to)}</p>
      <div className="tbl" role="region" aria-labelledby={headingId} tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">{C.date}</th><th scope="col" className="r">{C.dist}</th><th scope="col" className="r">{C.km}</th><th scope="col" className="r">{C.ld}</th>
              <th scope="col" className="r">{C.range}</th><th scope="col" className="r">{C.v}</th><th scope="col" className="r">{C.t}</th>
            </tr>
          </thead>
          <tbody>
            {shown.length ? <tr className="ca__group"><th colSpan={7} scope="rowgroup">{A.next}</th></tr> : null}
            {shown.map((c) => <Row key={c.jd} lang={lang} c={c} tag={c === closest ? A.closest : null} />)}
            {extra.length ? <tr className="ca__group"><th colSpan={7} scope="rowgroup">{extra.map((c) => (c === closest ? A.closest : A.last)).join(' · ')}</th></tr> : null}
            {extra.map((c) => <Row key={c.jd} lang={lang} c={c} tag={null} />)}
          </tbody>
        </table>
      </div>
      {!next.length ? <p className="note">{A.noneNext(to)}</p> : null}
    </>
  );
}
