import VarTip from './VarTip';

// element bloğu: sirkülerdeki gibi hizalı anahtar / değer / birim satırları (sabit genişlikli rakamlar).
// Satır: [simge, etiket, değer, birim, tür, alt]. tür 'text': değer ölçü değil metindir (yöntem, kaynak): düz yazıyla, satır kırarak.
// alt: değerin altında küçük ikinci satır (ör. ± 1σ belirsizlik). viz: { node, text } — etiket düğme olur; üzerine gelince ya da
// dokununca değerin ölçekli şeması ve açıklaması açılır (VarTip)
export default function ElementBlock({ rows, caption = null, className = '' }) {
  const shown = rows.filter((r) => r);
  return (
    <div className={`el ${className}`}>
      {caption ? <p className="el__cap">{caption}</p> : null}
      <dl>
        {shown.map(([sym, label, value, unit, kind, sub, viz]) => (
          <div className={kind === 'text' ? 'el__row el__row--text' : 'el__row'} key={label}>
            <dt><span className="el__sym">{sym}</span><span className="el__label">{viz && value != null ? <VarTip label={label} text={viz.text}>{viz.node}</VarTip> : label}</span></dt>
            <dd>
              <span className="el__val">{value ?? '—'}</span>{unit && value != null ? <span className="el__unit">{unit}</span> : null}
              {sub && value != null ? <span className="el__sub">{sub}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
