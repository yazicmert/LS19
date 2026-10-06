// Sayı ve tarih biçimleri (tr-TR). Intl biçimleyicileri bir kez kurulup önbelleğe alınır:
// Number.prototype.toLocaleString(yerel, seçenek) her çağrıda yeni biçimleyici kurar (~27 µs); önbellekli NumberFormat.format ~0,6 µs.
// Arayüz her 100 ms'de onlarca değer biçimlediği için fark ölçülebilir (kontrol sekmesi ~250 değer/güncelleme).
const LOC = 'tr-TR';
const nf = new Map();

// d basamaklı ondalık biçimleyici (önbellekli)
export function numberFormat(d = 0) {
  let f = nf.get(d);
  if (!f) { f = new Intl.NumberFormat(LOC, { minimumFractionDigits: d, maximumFractionDigits: d }); nf.set(d, f); }
  return f;
}
// sayı → "1.234,5" (sonlu değilse '—')
export const fmt = (x, d = 0) => (Number.isFinite(x) ? numberFormat(d).format(x) : '—');
// yuvarlanmış tamsayı: seçeneksiz toLocaleString V8'de hızlı yoldadır
export const fmtInt = (x) => Math.round(x).toLocaleString(LOC);

// tarih/saat biçimleyicileri (seçenek kümesi başına bir kez)
const dtf = new Map();
export function dateFormat(opt) {
  const k = JSON.stringify(opt);
  let f = dtf.get(k);
  if (!f) { f = new Intl.DateTimeFormat(LOC, opt); dtf.set(k, f); }
  return f;
}
export const HM = { hour: '2-digit', minute: '2-digit' }, HMS = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
