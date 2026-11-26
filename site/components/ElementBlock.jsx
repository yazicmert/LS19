// element bloğu: sirkülerdeki gibi hizalı anahtar / değer / birim satırları (sabit genişlikli rakamlar)
export default function ElementBlock({ rows, caption = null, className = '' }) {
  const shown = rows.filter((r) => r);
  return (
    <div className={`el ${className}`}>
      {caption ? <p className="el__cap">{caption}</p> : null}
      <dl>
        {shown.map(([sym, label, value, unit]) => (
          <div className="el__row" key={label}>
            <dt><span className="el__sym">{sym}</span><span className="el__label">{label}</span></dt>
            <dd><span className="el__val">{value ?? '—'}</span>{unit && value != null ? <span className="el__unit">{unit}</span> : null}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
