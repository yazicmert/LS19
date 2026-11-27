// arama ve filtre yardımcıları (saf; sunucu ve istemci): Türkçe ve İngilizce harf duyarsız eşleme, başlayan önce sıralama,
// adres parametreleriyle filtre durumu, sütuna göre sıralama
// norm: küçük harf, aksan yok (ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u, é→e), boşluk/tire/parantez/nokta yok: "İTOKAWA", "itokawa", "Itokawa" aynı
export function norm(s) {
  return String(s ?? '').replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase().replace(/ı/g, 'i')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s()\-–—.,_/'’]+/g, '');
}
// keys(o): aranacak metinler; başlayanlar önce, sonra içerenler; boş sorguda liste olduğu gibi
export function rank(list, q, keys) {
  const k = norm(q); if (!k) return list;
  const starts = [], has = [];
  for (const o of list) {
    const ks = keys(o).map(norm);
    if (ks.some((x) => x.startsWith(k))) starts.push(o); else if (ks.some((x) => x.includes(k))) has.push(o);
  }
  return [...starts, ...has];
}
// sıralama: değeri olmayanlar her yönde sonda; metinler dil kurallarıyla
export function sortBy(list, get, dir = 'asc', lang = 'en') {
  const sgn = dir === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => {
    const x = get(a), y = get(b);
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return sgn * (typeof x === 'string' ? x.localeCompare(y, lang) : x - y);
  });
}
// filtre durumu ⇄ adres parametreleri (yalnız varsayılandan farklı olanlar yazılır)
export function readParams(search, defaults) {
  const p = new URLSearchParams(search), out = { ...defaults };
  for (const k of Object.keys(defaults)) if (p.has(k)) out[k] = typeof defaults[k] === 'boolean' ? p.get(k) === '1' : p.get(k);
  return out;
}
export function writeParams(state, defaults) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) if (v !== defaults[k] && v !== '' && v != null) p.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : v);
  const s = p.toString(); return s ? `?${s}` : '';
}
