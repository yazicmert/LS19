// fırlatmalar küresi: Launch Library 2'nin hedef yörünge kısaltması → yörünge grubu ve şematik geometri (saf; Node'da sınanır).
// Her fırlatmanın yörüngesi kendi rampasının üstünden geçen bir düzlemde çizilir: eğim, grubun tipik değeri ya da rampa enlemi (doğrudan
// çıkışta en küçük eğim). Yükseklik sıkıştırılmış ölçekte (r = 1 + 0,08·log2(1 + h/100 km)): alçak ve yer eşzamanlı yörünge aynı resme sığsın
// diye; ölçekli değildir, sayfada da böyle yazar. Koordinatlar fırlatma üsleri küresiyle aynı: x = cos φ sin λ, y = sin φ, z = cos φ cos λ.
const D2R = Math.PI / 180, RE = 6378.137;
// grup: sıra renk yuvasıdır (--series-1…7; "other" gri). abbrev: LL2 yörünge kısaltmaları
export const ORBIT_GROUPS = [
  { id: 'leo', abbrev: ['LEO', 'VLEO'], h: 500 },
  { id: 'po', abbrev: ['PO'], h: 750, inc: 90 },
  { id: 'sso', abbrev: ['SSO'], h: 600, inc: 97.6 },
  { id: 'gto', abbrev: ['GTO', 'SupGTO', 'SubGTO'], hp: 200, ha: 35786 },
  { id: 'geo', abbrev: ['GEO', 'GSO'], h: 35786, inc: 0 },
  { id: 'meo', abbrev: ['MEO', 'HEO', 'Elliptical', 'Molniya'], h: 20200, inc: 55 },
  { id: 'deep', abbrev: ['TLI', 'LO', 'Lunar', 'Helio-N', 'Heliocentric', 'ES-L1', 'ES-L2', 'Mars', 'Venus', 'Jupiter', 'BLT'], escape: true },
];
const BY_ABBREV = new Map(ORBIT_GROUPS.flatMap((g, k) => g.abbrev.map((a) => [a.toLowerCase(), { ...g, slot: k + 1 }])));
// bilinmeyen ya da yörüngesiz (alt yörünge, N/A): null
export const orbitGroup = (abbrev) => (abbrev ? BY_ABBREV.get(String(abbrev).trim().toLowerCase()) || null : null);
export const rScale = (hKm) => 1 + 0.08 * Math.log2(1 + Math.max(0, hKm) / 100);
export const xyz = (lat, lon, r = 1) => [r * Math.cos(lat * D2R) * Math.sin(lon * D2R), r * Math.sin(lat * D2R), r * Math.cos(lat * D2R) * Math.cos(lon * D2R)];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
// rampada yörünge yönü: eğim i için fırlatma azimutu (sin A = cos i / cos φ); ulaşılamıyorsa en yakın (tam doğu ya da batı)
export function launchDir(lat, lon, inc) {
  const p = xyz(lat, lon), east = norm([Math.cos(lon * D2R), 0, -Math.sin(lon * D2R)]), north = cross(p, east);
  const s = Math.max(-1, Math.min(1, Math.cos(inc * D2R) / Math.cos(lat * D2R))), A = Math.asin(s);   // kuzeyden doğuya
  return { p, v: norm(east.map((e, k) => Math.sin(A) * e + Math.cos(A) * north[k])) };
}
// grubun eğimi: tipik değer yoksa rampanın enlemi (doğrudan çıkış); rampa enleminden küçükse enlem (eğim değiştirme çizilmez)
export const orbitInc = (g, lat) => Math.max(Math.abs(lat), g.inc ?? Math.abs(lat));
// çizgi noktaları (birim küre ölçeğinde): kapalı yörünge, GTO elipsi (yerberi rampa yönünde) ya da kaçış eğrisi
export function orbitPath(g, lat, lon, n = 160) {
  const inc = g.id === 'geo' ? 0 : orbitInc(g, lat);
  if (g.id === 'geo') {                                         // ekvator düzleminde: rampanın boylamından başlar
    return Array.from({ length: n + 1 }, (_, k) => xyz(0, lon + (360 * k) / n, rScale(g.h)));
  }
  const { p, v } = launchDir(lat, lon, inc), pt = (ang, r) => p.map((x, k) => r * (Math.cos(ang) * x + Math.sin(ang) * v[k]));
  if (g.escape) return Array.from({ length: n / 4 + 1 }, (_, k) => { const t = k / (n / 4); return pt(t * 1.6, 1.04 + t * 0.9 + t * t * 0.4); });
  if (g.hp != null) {                                            // elips: gerçek r(ν) sıkıştırılmış ölçekte
    const rp = RE + g.hp, ra = RE + g.ha, a = (rp + ra) / 2, e = (ra - rp) / (ra + rp);
    return Array.from({ length: n + 1 }, (_, k) => { const nu = (2 * Math.PI * k) / n; return pt(nu, rScale((a * (1 - e * e)) / (1 + e * Math.cos(nu)) - RE)); });
  }
  return Array.from({ length: n + 1 }, (_, k) => pt((2 * Math.PI * k) / n, rScale(g.h)));
}
// küre için özet: gruplara göre fırlatmalar (sayı sırasıyla), rampalar (aynı noktadakiler birleşik)
export function globeSummary(rows) {
  const groups = new Map(), pads = new Map();
  for (const r of rows) {
    const g = orbitGroup(r.orbit), key = g ? g.id : 'other';
    const e = groups.get(key) || { id: key, slot: g ? g.slot : 0, n: 0, abbrev: new Set() }; e.n++; if (r.orbit) e.abbrev.add(r.orbit); groups.set(key, e);
    if (r.lat != null && r.lon != null) { const pk = `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`, q = pads.get(pk) || { lat: r.lat, lon: r.lon, name: r.pad, n: 0 }; q.n++; pads.set(pk, q); }
  }
  return { groups: [...groups.values()].map((x) => ({ ...x, abbrev: [...x.abbrev] })).sort((a, b) => (a.id === 'other') - (b.id === 'other') || b.n - a.n), pads: [...pads.values()] };
}
