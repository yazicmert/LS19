// fırlatma üssünün konumu ve yakıt maliyeti (saf; Node'da sınanır). LS19'un web/js/pads.js'indeki bağıntıların site için kopyası.
//
// Dünya dönüşü: ekvatorda 465,1 m/s; enlem φ'de yerel doğuya v = 465,1·cos φ. Azimut A ile (kuzeyden saat yönü) fırlatılırsa yörünge eğimi
//   cos i = cos φ · sin A  →  doğrudan çıkışta i ≥ |φ| (en küçük eğim = enlem; tam doğuya fırlatma). Dönüşün yörünge yönündeki katkısı 465,1·cos i.
// Eğim değiştirme: dairesel yörüngede Δv = 2·v·sin(Δi/2); en ucuz yer yavaş olunan yerdir (GTO'nun yerötesi).
// GTO → GEO: yerötesinde (42 164 km) çemberleştirme ve eğim sıfırlama birlikte: Δv² = v_a² + v_geo² − 2·v_a·v_geo·cos i.
const MU = 398600.4418, RE = 6378.137, OMEGA = 7.2921159e-5, D2R = Math.PI / 180;
export const V_EQ = OMEGA * RE * 1000;                                   // m/s
export const R_GEO = 42164.17;
export const rotSpeed = (lat) => V_EQ * Math.cos(lat * D2R);              // m/s, yerel doğuya
export const minIncl = (lat) => Math.abs(lat);
export const rotBoost = (inc) => V_EQ * Math.cos(inc * D2R);              // eğim i'deki yörüngeye dönüşün katkısı (m/s)
// eğim i için fırlatma azimutu (°; doğuya doğru kol). Ulaşılamıyorsa null
export function azimuthFor(lat, inc) { const s = Math.cos(inc * D2R) / Math.cos(lat * D2R); return Math.abs(s) > 1 ? null : Math.asin(s) / D2R; }
// izinli azimut aralığından ulaşılabilen ileri yönlü eğimler [en küçük, en büyük] (°); geri yönlü (i > 90°) ayrıca
export function inclFromAz(lat, [a0, a1]) {
  let lo = 180, hi = 0; const cf = Math.cos(lat * D2R);
  for (let k = 0; k <= 720; k++) { const a = a0 + ((a1 - a0) * k) / 720, i = Math.acos(Math.max(-1, Math.min(1, cf * Math.sin(a * D2R)))) / D2R; lo = Math.min(lo, i); hi = Math.max(hi, i); }
  return [Math.round(lo * 10) / 10, Math.round(hi * 10) / 10];
}
const vCirc = (r) => Math.sqrt(MU / r);
// GTO (yerberi yüksekliği hp km) yerötesinde GEO'ya geçiş: Δv (m/s) eğim i ile
export function gtoToGeo(inc, hp = 200) {
  const rp = RE + hp, a = (rp + R_GEO) / 2, va = Math.sqrt(MU * (2 / R_GEO - 1 / a)), vg = vCirc(R_GEO);
  return 1000 * Math.sqrt(va * va + vg * vg - 2 * va * vg * Math.cos(inc * D2R));
}
// alçak yörüngede (h km) eğim değişimi Δi için Δv (m/s)
export const planeChange = (di, h = 400) => 1000 * 2 * vCirc(RE + h) * Math.sin((Math.abs(di) * D2R) / 2);
// Tsiolkovsky: Δv için yakılan itki kütlesinin başlangıç kütlesine oranı (Isp s)
export const propFraction = (dv, isp) => 1 - Math.exp(-dv / (isp * 9.80665));

// menzil güvenliği: kaynağı olan izinli azimutlar (LS19 web/js/pads.js ile aynı; diğer üslerde bilinmiyor diye yazılır)
export const RANGES = {
  canaveral: { az: [35, 120], src: 'https://fireflyspace.com/?p=821' },
  kennedy: { az: [35, 120], src: 'https://fireflyspace.com/?p=821' },
  vandenberg: { az: [140, 260], src: 'https://fireflyspace.com/?p=821' },
  kourou: { az: [-10.5, 93.5], src: 'https://spaceodysseyhub.com/compare/spaceports/guiana-space-centre' },
};
// üsten ulaşılan yörünge eğimlerinin dağılımı (başarılı, yörüngesel, eğimi bilinen fırlatmalar; 10°'lik kutular, 0–180)
export function inclHistogram(launches, bin = 10) {
  const n = Math.ceil(180 / bin), h = Array(n).fill(0);
  for (const l of launches) if (l.o === 'S' && !l.deep && l.inc != null && l.inc >= 0 && l.inc <= 180) h[Math.min(n - 1, Math.floor(l.inc / bin))]++;
  return h;
}
// bir üssün özeti (dizin ve sayfa için)
export function siteSummary(s) {
  const lat = s.lat, inc0 = minIncl(lat), geo = gtoToGeo(inc0), geo0 = gtoToGeo(0);
  return { rot: rotSpeed(lat), minInc: inc0, geoDv: geo, geoExtra: geo - geo0, range: RANGES[s.slug] || null };
}

// üssün özellikleri (sayfadaki "Özellikler" bloğu): veri tarihine göre etkinlik, etkin rampalar, son yıllarda uçan roketler, ulaşılan
// en sık ulaşılan yörünge eğimleri (başarılı, yörüngesel, eğimi bilinen fırlatmalar; 1°'ye yuvarlanmış). Eşikler: etkin = son 2 yılda
// fırlatma; rampa ve roket için son 3 yıl.
export function siteFeatures(s, today) {
  const y = +today.slice(0, 4), cut2 = `${y - 2}${today.slice(4)}`, cut3 = `${y - 3}${today.slice(4)}`, lat = Math.abs(s.lat);
  const recent = s.launches.filter((l) => l.d >= cut3), rk = new Map();
  for (const l of recent) rk.set(l.lv, (rk.get(l.lv) || 0) + 1);
  // en sık ulaşılan eğimler: 1°'ye yuvarlanmış; kutup / Güneş eşzamanlı (85°–105°) ve ters yönlü (> 105°) işaretli
  const inc = new Map(); let n = 0;
  for (const l of s.launches) { if (l.o !== 'S' || l.deep || l.inc == null) continue; n++; const k = Math.round(l.inc); inc.set(k, (inc.get(k) || 0) + 1); }
  return {
    active: s.stats.last >= cut2,
    pads: { active: s.pads.filter((p) => p.last && p.last >= cut3).length, total: s.pads.length },
    rocketsNow: [...rk.entries()].sort((a, b) => b[1] - a[1]).map(([name, k]) => ({ name, n: k, slug: (s.rockets.find((r) => r.name === name) || {}).slug })),
    orbits: n ? [...inc.entries()].map(([deg, v]) => ({ deg, share: v / n, k: deg > 105 ? 'retro' : deg >= 85 ? 'polar' : null })).sort((a, b) => b.share - a.share) : [],
  };
}
