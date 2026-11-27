'use client';
// değişken açıklaması: etiket bir düğme; fareyle üzerine gelince (kısa gecikmeyle), klavyeyle odaklanınca ya da dokununca altında şema
// ve tek cümlelik açıklama açılır. Esc kapatır ve odağı düğmeye döndürür; aynı anda yalnız biri açık kalır. Şema aria-hidden, anlamı
// açıklama cümlesi taşır (düğmenin aria-describedby'ı).
import { useEffect, useId, useRef, useState } from 'react';

let closeOther = null;
export default function VarTip({ label, text, children }) {
  const [open, setOpen] = useState(false), id = useId(), btn = useRef(null), timer = useRef(0), pinned = useRef(false);
  const show = () => { if (closeOther && closeOther !== hide) closeOther(); closeOther = hide; setOpen(true); };
  const hide = () => { pinned.current = false; setOpen(false); if (closeOther === hide) closeOther = null; };
  const later = (fn, ms) => { clearTimeout(timer.current); timer.current = setTimeout(fn, ms); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === 'Escape') { hide(); btn.current && btn.current.focus(); } };
    const out = (e) => { if (btn.current && !btn.current.parentElement.contains(e.target)) hide(); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', out);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', out); };
  }, [open]);
  return (
    <span className="vt" onMouseEnter={() => later(show, 120)} onMouseLeave={() => { if (!pinned.current) later(hide, 160); }}>
      <button ref={btn} type="button" className="vt__btn" aria-expanded={open} aria-controls={`${id}-p`} aria-describedby={`${id}-d`}
        onFocus={() => later(show, 0)} onBlur={(e) => { if (!e.currentTarget.parentElement.contains(e.relatedTarget)) later(hide, 0); }}
        onClick={() => { clearTimeout(timer.current); if (open && pinned.current) hide(); else { pinned.current = true; show(); } }}>
        {label}
      </button>
      <span id={`${id}-p`} className="vt__pop" data-open={open ? '' : undefined} role="group" aria-label={label}>
        {children}
        <span id={`${id}-d`} className="vt__txt">{text}</span>
      </span>
    </span>
  );
}
