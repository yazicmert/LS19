// format.js doğrulaması (Node): cd web && node test/test_format.js
//  1) fmt, Number.prototype.toLocaleString('tr-TR', { min/maxFractionDigits }) ile aynı metni üretir (işaret, binlik ayracı, ondalık virgülü, sıfır, çok büyük/küçük)
//  2) sonlu olmayan değerlerde '—'
//  3) biçimleyiciler önbelleklenir (aynı basamak sayısı → aynı nesne) ve önbellekli yol, seçenekli toLocaleString'ten en az 5 kat hızlıdır
//  4) tarih/saat biçimleyicisi toLocale*String ile aynı metni üretir
import { fmt, fmtInt, numberFormat, dateFormat, HM, HMS } from '../js/format.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const ref = (x, d) => x.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });

const xs = [0, -0, 1, -1, 0.5, 1234.5678, -98765.4321, 1e-7, 123456789.987, 3.14159265, 1e15, -2.5e-3, 999.9995, 0.05, 42];
let bad = [];
for (const x of xs) for (const d of [0, 1, 2, 3, 5]) { const a = fmt(x, d), b = ref(x, d); if (a !== b) bad.push(`${x}/${d}: ${a} ≠ ${b}`); }
check('fmt: toLocaleString(tr-TR, basamak seçenekleri) ile aynı metin (15 değer × 5 basamak)', bad.length === 0, bad.slice(0, 3).join('; '));
check('fmt: sonlu olmayan değerler → —', fmt(NaN) === '—' && fmt(Infinity, 2) === '—' && fmt(-Infinity) === '—' && fmt(undefined) === '—');
check('fmt: varsayılan basamak 0, Türkçe ayraçlar (1.234,57 / 1.235)', fmt(1234.567, 2) === '1.234,57' && fmt(1234.567) === '1.235');
check('fmtInt: yuvarlar ve binlik ayracı koyar', fmtInt(12345.6) === '12.346' && fmtInt(-0.4) === (Math.round(-0.4)).toLocaleString('tr-TR'));
check('numberFormat: aynı basamak sayısı için aynı nesne (önbellek), farklı basamak için farklı nesne', numberFormat(2) === numberFormat(2) && numberFormat(2) !== numberFormat(3));

// hız: önbellekli yol seçenekli toLocaleString'ten çok daha hızlı olmalı (ısınma sonrası)
const N = 60000, vals = Array.from({ length: 1000 }, (_, i) => i * 13.37 + 0.123);
const bench = (f) => { for (let i = 0; i < 3000; i++) f(vals[i % 1000], i % 3); const t0 = performance.now(); let s = 0; for (let i = 0; i < N; i++) s += f(vals[i % 1000], i % 3).length; return { ms: (performance.now() - t0), s }; };
const slow = bench(ref), fast = bench(fmt);
check('hız: önbellekli fmt, seçenekli toLocaleString\'ten ≥ 5× hızlı', slow.ms / fast.ms >= 5, `toLocaleString ${(slow.ms / N * 1000).toFixed(2)} µs, fmt ${(fast.ms / N * 1000).toFixed(2)} µs (${(slow.ms / fast.ms).toFixed(0)}×)`);

const t = Date.UTC(2026, 9, 6, 13, 7, 9);
check('dateFormat: toLocaleTimeString(tr-TR) ile aynı saat metni; aynı seçenek aynı nesne',
  dateFormat(HM).format(t) === new Date(t).toLocaleTimeString('tr-TR', HM) && dateFormat(HMS).format(t) === new Date(t).toLocaleTimeString('tr-TR', HMS) && dateFormat(HM) === dateFormat({ hour: '2-digit', minute: '2-digit' }),
  `${dateFormat(HMS).format(t)}`);

console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
