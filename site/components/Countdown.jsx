'use client';
// geri sayım: T− g ss:dd:ss (sabit genişlikli rakamlar). Sunucuda ve ilk karede boş: saat istemcide başlar (hidrasyon farkı olmasın).
// res 'hour': kaynak saati yalnız saat düzeyinde veriyor → T− g ≈ss sa (dakika ve saniye gösterilmez)
import { useEffect, useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');
export function split(ms) {
  const s = Math.floor(Math.abs(ms) / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return { sign: ms >= 0 ? '−' : '+', d, hms: `${pad(h)}:${pad(m)}:${pad(s % 60)}` };
}
export default function Countdown({ net, label, dayUnit = 'd', hourUnit = 'h', res = 'sec' }) {
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(Date.now()); const k = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(k); }, []);
  const target = Date.parse(net);
  if (now == null || !Number.isFinite(target)) return <p className="cd" aria-label={label}><span className="cd__t">T−</span><span className="cd__v cd__v--wait">––:––:––</span></p>;
  const x = split(target - now);
  return (
    <p className="cd" role="timer" aria-label={label}>
      <span className="cd__t">T{x.sign}</span>
      {x.d ? <span className="cd__d">{x.d}<span className="cd__u">{dayUnit}</span></span> : null}
      {res === 'hour' ? <span className="cd__v">≈{x.hms.slice(0, 2)}<span className="cd__u">{hourUnit}</span></span> : <span className="cd__v">{x.hms}</span>}
    </p>
  );
}
