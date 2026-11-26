// tablo ve listedeki kısa ad: numara ayrı sütunda; adsız cisimde geçici gösterim parantezsiz
export const shortName = (o) => (o.number != null && o.name.startsWith(String(o.number)) ? o.name.replace(/^\d+\s*/, '').replace(/^\((.*)\)$/, '$1') : o.name);
// arama: ad, numara ya da geçici gösterim; büyük/küçük harf, boşluk ve parantez duyarsız (istemci + sunucu)
export function matchObjects(list, q) {
  const n = (s) => String(s || '').toLocaleLowerCase('en').replace(/[\s()-]+/g, '');
  const k = n(q); if (!k) return list;
  const starts = [], has = [];
  for (const o of list) {
    const keys = [o.name, o.des, o.number != null ? String(o.number) : ''].map(n);
    if (keys.some((x) => x.startsWith(k))) starts.push(o); else if (keys.some((x) => x.includes(k))) has.push(o);
  }
  return [...starts, ...has];
}
