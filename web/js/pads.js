// Fırlatma rampaları (Ay görevi): seçim, roket ↔ rampa uygunluğu ve kalkışın maliyeti. Saf veri/fizik (DOM yok; Node'da sınanır: test/test_pads.js).
// Rampa listesi: data/pads.json (tools/rampa_derle.mjs; The Space Devs Launch Library 2, yörüngesel deneme sayısı > 0).
//
// Kalkış maliyeti (Dünya dönüşünün katkısı): rampa yerel doğuya göre azimut A ile fırlatırsa yörünge eğimi i için cos i = cos φ · sin A.
// Rampanın eylemsiz hızının yörünge hızı yönündeki bileşeni ω R cos φ · sin A = ω R_eq·cos i (yaklaşık; R cos φ yarıçapıyla) — enlemden bağımsız,
// yalnız eğime bağlıdır. Enlem en küçük eğimi sınırlar: doğrudan (köpek bacağı manevrası olmadan) i ≥ |φ|.
// Roketin yayımlanmış başarımı bir başvuru eğimi için (Florida: 28,5°); başka eğimde gereken ek Δv = V_EQ (cos i_ref − cos i).
// Bu ek Δv'yi üst kademe karşılar sayılır: park yörüngesine ulaşan kütle M · exp(−Δv / (Isp g0)) (birinci derece yaklaşım; çıkış kayıpları aynı kabul edilir).

export const OMEGA_E = 7.2921159e-5;                 // rad/s (IERS)
export const R_EQ = 6378.137;                        // km (WGS-84)
export const V_EQ = OMEGA_E * R_EQ;                  // 0,4651 km/s: ekvatordaki dönüş hızı
export const REF_INC = 28.5;                          // yayımlanmış başarımların başvuru eğimi (°, Florida doğu fırlatması)

// Eski varsayılan fırlatma noktası (hazır tasarımlar bununla; LL2'deki gerçek LC-39B ~6 km kuzeyde: 28,6271° K, 80,6210° B)
export const LEGACY_SITE = { id: 0, name: 'Kennedy Uzay Merkezi LC-39B', short: 'KSC LC-39B', lat: 28.5729, lon: -80.6490, legacy: true, az: [35, 120] };

// Roketlerin gerçekte fırlatıldığı rampalar (LL2 kimlikleri): gerçek roket yalnız bunlardan seçilebilir; genel kademe her rampadan
//   Saturn V: LC-39A (12 uçuş), LC-39B (Apollo 10) · SLS: LC-39B · Falcon 9: SLC-40, LC-39A, SLC-4E (Vandenberg) · Falcon Heavy: LC-39A · Vulcan: SLC-41
export const ROCKET_PADS = { SATURN_V: [87, 4], SLS1: [4], F9: [80, 87, 16], FH: [87], VULCAN: [29] };
export const padAllowed = (rocket, padId) => !ROCKET_PADS[rocket] || padId === 0 || ROCKET_PADS[rocket].includes(padId);

const D2R = Math.PI / 180;
// Menzil güvenliği: yerleşim yerleri üzerinden uçmamak için izinli fırlatma azimutları (°, kuzeyden saat yönü). Yalnız kaynağı olan menziller;
// diğer rampalarda sınır uygulanmaz (arayüz bunu söyler).
//   Doğu Menzili (Cape Canaveral / KSC): 35°–120° — Firefly CCSFS işletme bilgisi; Wikipedia "Eastern Range" (bazı kaynaklar 37°–114°)
//   Batı Menzili (Vandenberg): 140°–260° — Firefly VSFB işletme bilgisi (ileri yönlü yörüngeler için güneye fırlatma)
//   Guyana Uzay Merkezi (Kourou): −10,5°–93,5° — ikincil kaynak (spaceodysseyhub)
export const RANGES = [
  { re: /Cape Canaveral|Kennedy Space Center/i, name: 'Doğu Menzili', az: [35, 120], src: 'https://fireflyspace.com/?p=821' },
  { re: /Vandenberg/i, name: 'Batı Menzili', az: [140, 260], src: 'https://fireflyspace.com/?p=821' },
  { re: /Guiana Space Centre|Kourou/i, name: 'Guyana Uzay Merkezi', az: [-10.5, 93.5], src: 'https://spaceodysseyhub.com/compare/spaceports/guiana-space-centre' },
];
export const rangeOf = (loc) => RANGES.find((r) => r.re.test(loc || '')) || null;
// azimut a (°) aralıkta mı (aralık 360°'yi sarabilir: Kourou −10,5°)
export const azInRange = (a, [a0, a1]) => { const x = ((a - a0) % 360 + 360) % 360; return x <= a1 - a0 + 1e-9; };
// izinli azimutlarla doğrudan ulaşılabilen ileri yönlü eğim aralığı [en küçük, en büyük] (°): cos i = cos φ · sin A, i ≤ 90°
export function inclRange(latDeg, az) {
  const cf = Math.cos(latDeg * D2R); let lo = 90, hi = Math.abs(latDeg);
  const A = az || [0, 360];
  for (let k = 0; k <= 720; k++) {
    const a = A[0] + (A[1] - A[0]) * k / 720, c = cf * Math.sin(a * D2R);
    if (c < 0) continue;                                             // geri yönlü (i > 90°): modellenmez
    const i = Math.acos(Math.min(1, c)) / D2R; lo = Math.min(lo, i); hi = Math.max(hi, i);
  }
  return lo > hi ? null : [Math.ceil(Math.max(lo, Math.abs(latDeg)) * 10 - 1e-9) / 10, Math.floor(hi * 10 + 1e-9) / 10];
}
// eğim i (°) için dönüşün katkısı (km/s)
export const rotationBoost = (incDeg) => V_EQ * Math.cos(incDeg * D2R);
// başvuru eğimine göre ek Δv (km/s; negatif = kazanç)
export const incPenalty = (incDeg, refDeg = REF_INC) => V_EQ * (Math.cos(refDeg * D2R) - Math.cos(incDeg * D2R));
// rampadan doğrudan ulaşılabilen en küçük eğim (°): |enlem|, 0,1°'ye yukarı yuvarlanmış
export const minIncl = (latDeg) => Math.ceil(Math.abs(latDeg) * 10 - 1e-9) / 10;
// eğim i için fırlatma azimutu (°, kuzeyden saat yönü; doğuya doğru kol): sin A = cos i / cos φ
export function launchAzimuth(latDeg, incDeg) {
  const s = Math.cos(incDeg * D2R) / Math.cos(latDeg * D2R);
  return Math.abs(s) > 1 ? NaN : Math.asin(s) / D2R;
}
// pads.json → kimliğe göre harita; site kaydı (tasarım yapılandırması) üretir
export function padIndex(json) { const m = new Map(); for (const p of (json && json.pads) || []) m.set(p.id, p); return m; }
export function siteOf(p) {
  if (!p || p.legacy) return null;
  const r = rangeOf(p.loc);
  return { id: p.id, name: `${p.loc.replace(/,.*$/, '')} ${p.name}`.trim(), lat: +p.lat, lon: +p.lon, ...(r ? { az: r.az.slice() } : {}) };
}
// rampa adı kısa biçim: "Space Launch Complex 40" → "SLC-40", "Launch Complex 39A" → "LC-39A"
export function padShort(name) {
  return String(name || '').replace(/^Space Launch Complex\s*/i, 'SLC-').replace(/^Launch Complex\s*/i, 'LC-').replace(/^Launch Area\s*/i, 'LA-');
}
