// Görev brifingi: saf yardımcılar (DOM yok, Node'da sınanır; arayüz brifing.js).
// Ay görevi artık hazır bir görevle park yörüngesinde açılmaz: önce LS19 kullanıcıya görevi tasarlatır (Nereye → Ne zaman → Nasıl → Neyle → Brifing),
// sonra görev rampadan (kalkış canlandırması) ya da yörüngeden başlar. Paylaşılan bağlantı ve ayarlı adres brifingi atlar.
import { AY_LINK_KEYS } from './aytext.js';

export const BRIEF_STEPS = [
  { k: 'yer', t: 'Nereye?', s: 'İniş yeri' },
  { k: 'tarih', t: 'Ne zaman?', s: 'Fırlatma tarihi' },
  { k: 'profil', t: 'Nasıl?', s: 'Yörünge profili' },
  { k: 'roket', t: 'Neyle?', s: 'Roket ve araç' },
  { k: 'brifing', t: 'Brifing', s: 'Görev özeti' },
];

// iniş yerleri: neden seçilir (LUNAR_SITES ile aynı kimlikler)
export const SITE_NOTES = {
  A11: { t: 'Huzur Denizi', s: 'Geniş, düz bir mare ovası: en güvenli iniş. İnsanlığın Ay\'a ilk adımı (1969).' },
  A12: { t: 'Fırtınalar Okyanusu', s: 'Hassas iniş: Apollo 12, iki yıl önce inen Surveyor 3\'ün 180 m yanına kondu.' },
  A14: { t: 'Fra Mauro', s: 'Tepelik arazi: İmbrium havzasını oluşturan çarpmanın fırlattığı kayalar.' },
  A15: { t: 'Hadley–Apennine', s: 'Apennin dağlarıyla Hadley vadisi arasında: en etkileyici manzara, dağların arasından iniş.' },
  A16: { t: 'Descartes', s: 'Apollo\'nun tek yayla inişi: engebeli ve yüksek arazi.' },
  A17: { t: 'Taurus–Littrow', s: 'Dağlarla çevrili dar bir vadi: Apollo\'nun son ve en uzun görevi (1972).' },
};

// tarih seçenekleri (today: bugünün tarihi, YYYY-AA-GG)
export const DEFAULT_BRIEF_DATE = '2026-10-13';
export function datePresets(today) {
  return [
    { k: 'hazir', d: DEFAULT_BRIEF_DATE, t: 'Ekim 2026', s: 'Hazır görev penceresi: Apollo 11 yerine anında tasarlanır' },
    { k: 'bugun', d: today, t: 'Bugünden sonra', s: 'Bugünden sonraki ilk uygun aydınlanma penceresi' },
    { k: 'a11', d: '1969-07-16', t: 'Apollo 11 günü', s: '16 Temmuz 1969: tarihî fırlatmanın gökyüzüyle' },
  ];
}

// profiller (design.js PROFILES ile aynı anahtarlar)
export const PROFILE_NOTES = {
  APOLLO: { t: 'Apollo, hızlı', s: 'Doğrudan Ay\'a, 110 km\'lik yörüngede 2 tur, iniş. En kısa ve en az yakıtlı yol.' },
  APOLLO11: { t: 'Apollo 11 gibi', s: 'Aynı yol, Ay yörüngesinde 13 tur: 1969\'daki gibi iniş öncesi uzun gözlem.' },
  YUKSELTME: { t: 'Yörünge yükseltmeli', s: 'Önce üç yakışla apoje 40.000 km\'ye, sonra Ay\'a: küçük roketlerin yolu.' },
  NRHO: { t: 'Artemis (NRHO)', s: 'Gateway\'in yörüngesinde (NRHO 9:2) bekleme, sonra iniş: Artemis görevlerinin yolu.' },
  L2: { t: 'L2 halo', s: 'Ay\'ın arkasındaki L2 noktası çevresinde halo yörüngesi, sonra iniş.' },
  L1: { t: 'L1 halo', s: 'Dünya ile Ay arasındaki L1 noktası çevresinde halo yörüngesi, sonra iniş.' },
};
export const PROFILE_ORDER = ['APOLLO', 'APOLLO11', 'YUKSELTME', 'NRHO', 'L2', 'L1'];
const HALO = new Set(['NRHO', 'L2', 'L1']);

// hazır tasarımlardan (data/designs_default.json) profilin toplam Δv'si (m/s), fırlatmadan inişe süre (gün), iniş aracı kütlesi (kg)
export function profileStats(defs, key) {
  const p = defs && defs.profiles && defs.profiles[key]; return p && p.design ? statsOf(p.design) : null;
}
// bir tasarımın özeti: toplam Δv, süre, iniş aracı kütlesi ve yakıt (gereken / kademede olan: TLI kademesi ve iniş aracı)
export function statsOf(D) {
  if (!D || !D.LAUNCH) return null;
  const S = D.STAGES || [], dv = Object.values(D.DV || {}).filter((v) => Number.isFinite(v)).reduce((a, b) => a + b, 0);
  const days = D.t_L != null && D.LAUNCH ? (D.t_L - D.LAUNCH.t_launch) / 86400 : null;
  const lander = S.slice(1).reduce((q, s) => q + (s.dry || 0) + (s.prop || 0), 0);
  return { dv, days, lander, tliNeed: D.TLI_NEED ?? null, tliHave: S[0] ? S[0].prop : null, landNeed: D.LANDER_NEED ?? null, landHave: S[1] ? S[1].prop : null };
}

// roketin aracı Ay yoluna gönderip gönderemeyeceği (cap: rockets.js tliCapacity, null = göreve göre boyutlanan genel kademe)
export function rocketFit(cap, lander) {
  if (cap == null) return { ok: true, sized: true, margin: null };
  if (!(lander > 0)) return { ok: true, sized: false, margin: null };
  return { ok: cap >= lander, sized: false, margin: cap / lander - 1 };
}

// tasarım süresi kestirimi: hazır tasarım (Apollo 11 yeri, hazır tarih, genel kademe) anında; halo profilleri en uzun (iniş öncesi uzun bekleme yörüngesi)
export function designEta(sel, defsDate = DEFAULT_BRIEF_DATE) {
  if (sel.site === 'A11' && sel.date === defsDate && sel.rocket === 'GENEL' && PROFILE_ORDER.includes(sel.profile)) return { k: 'now', t: 'anında' };
  if (HALO.has(sel.profile)) return { k: 'long', t: '1–2 dakika' };
  return { k: 'mid', t: '10–30 saniye' };
}

// LS19'un önerisi: her adım için değer ve gerekçe (sel: o ana dek seçilenler)
export function recommend(step, sel = {}, today = DEFAULT_BRIEF_DATE) {
  switch (step) {
    case 'yer': return { v: 'A15', why: 'Hadley–Apennine: dağların arasından iniş, en etkileyici manzara.' };
    case 'tarih': return sel.site === 'A11' || !sel.site
      ? { v: DEFAULT_BRIEF_DATE, why: 'Ekim 2026 penceresi Apollo 11 yerine hazır: görev anında kurulur.' }
      : { v: today, why: 'Bugünden sonraki ilk uygun pencere: yer, iniş sırasında alçak Güneş altında olur (uzun gölgeler araziyi gösterir).' };
    case 'profil': return { v: 'APOLLO', why: 'En kısa yol ve en az yakıt: Ay\'a doğrudan aktarma, kısa bekleme.' };
    case 'roket': return HALO.has(sel.profile)
      ? { v: 'SLS1', why: 'Artemis\'in roketi: halo yörüngesi için güçlü üst kademe.' }
      : { v: 'SATURN_V', why: 'Apollo\'nun roketi: kalkışta beş F-1 motoru, gerçek S-IVB ile Ay\'a aktarma.' };
    default: return null;
  }
}

// kim brifingi görür: 'new' (ilk ziyaret), 'return' (geri dönen: "devam et" kartı), null (brifing yok).
// Brifing yalnız Ay görevine GİRİLİNCE açılır (entered: kullanıcı Laboratuvar merkezinden Ay görevini seçti): Laboratuvar'ın kendisi açılınca değil
// (Laboratuvar'da başka deneyler de var; açılış deney merkezidir). Sayfa doğrudan Ay görevinde açılırsa (kayıtlı son deney, ?exp=ay) brifing kendiliğinden açılmaz:
// paneldeki "LS19 ile adım adım tasarla" düğmesi açar. Bağlantıyla gelen (görev anahtarları, sekme, fragman) brifingi görmez: bağlantı görevi doğrudan kurar.
// ?brifing=1 her zaman açar, ?brifing=0 hiç açmaz.
export function briefKind({ search = '', visited = false, view = 'lab', exp = 'ay', entered = false } = {}) {
  const q = new URLSearchParams(search);
  if (q.get('brifing') === '0') return null;
  if (q.get('brifing') === '1') return visited ? 'return' : 'new';
  if (view !== 'lab' || exp !== 'ay' || !entered) return null;
  if (AY_LINK_KEYS.some((k) => q.has(k)) || q.has('tab') || q.has('cine') || q.has('kurgu')) return null;
  return visited ? 'return' : 'new';
}

// brifing özeti (tasarlanmış görev): utc(t) → metin; DV sıralı (tasarımın sırası)
export function briefSummary(D, utc) {
  if (!D || !D.LAUNCH) return null;
  const dv = Object.entries(D.DV || {}).filter(([, v]) => Number.isFinite(v));
  const total = dv.reduce((a, [, v]) => a + v, 0);
  const days = D.t_L != null ? (D.t_L - D.LAUNCH.t_launch) / 86400 : null;
  return { launch: utc(D.LAUNCH.t_launch), landing: D.t_L != null ? utc(D.t_L) : null, days, dv, total, sunEl: D.sunElAtLanding ?? null, label: D.label || '' };
}

// ---------------------------------------------------------------- Aşama 2: şematik profil yolları ve gerekçeler
// Şematik yol (gerçek yörünge değil: gerçek yol uçuşta çizilir): Dünya–Ay dönen çerçevesi, birim = Dünya–Ay uzaklığı. x Ay'a doğru, y Ay'ın yörünge
// yönünde, z yörünge normali. Yörüngeler okunur olsun diye büyütülmüş (park yörüngesi, Ay yörüngesi). Parçalar: park, raise, transfer, halo, moon
export const L1X = 0.849, L2X = 1.168;                                               // Dünya–Ay L1/L2 (Ay'ın uzaklığına oranla)
const PARK_R = 0.035, MOON_R = 0.026;
const arc = (cx, cy, r, a0, a1, n = 48, cz = 0, rz = 0, ry = r) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cy + ry * Math.sin(a), cz + rz * Math.sin(a)]; });
const bez = (p0, p1, p2, p3, n = 64) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [0, 1, 2].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]); });
// gerçek yol (design.js missionPath) varsa: aktarma ve halo gerçek, park ve Ay yörüngesi şematik (okunur olsun diye büyütülmüş)
export function livePath(key, real) {
  if (!real || !real.length) return null;
  const sch = profilePath(key);
  return [...sch.filter((p) => p.kind === 'park' || p.kind === 'moon'), ...real.map((p) => ({ ...p, real: true }))];
}
export function profilePath(key) {
  const parts = [{ kind: 'park', pts: arc(0, 0, PARK_R, 0, 2 * Math.PI) }];
  const toMoon = (end, c2 = [0.78, -0.3, 0]) => bez([0, -PARK_R, 0], [0.22, -0.42, 0], c2, end);
  const moon = (revs = 1) => Array.from({ length: revs }, (_, k) => ({ kind: 'moon', pts: arc(1, 0, MOON_R * (1 + 0.12 * k), 0, 2 * Math.PI) }));
  if (key === 'YUKSELTME') {
    for (const ha of [0.045, 0.075, 0.104]) { const a = (PARK_R + ha) / 2, c = a - PARK_R; parts.push({ kind: 'raise', pts: arc(-c, 0, a, 0, 2 * Math.PI, 64, 0, 0, Math.sqrt(PARK_R * ha)) }); }
    parts.push({ kind: 'transfer', pts: toMoon([1, -MOON_R, 0]) }, ...moon(1));
  } else if (key === 'NRHO' || key === 'L2' || key === 'L1') {
    const H = key === 'NRHO' ? { c: [1, 0, 0.07], rx: 0.018, ry: 0.03, rz: 0.11 } : key === 'L2' ? { c: [L2X, 0, 0], rx: 0.03, ry: 0.085, rz: 0.06 } : { c: [L1X, 0, 0], rx: 0.03, ry: 0.07, rz: 0.05 };
    const halo = Array.from({ length: 97 }, (_, i) => { const a = 2 * Math.PI * i / 96; return [H.c[0] + H.rx * Math.cos(a), H.c[1] + H.ry * Math.sin(a), H.c[2] + H.rz * Math.cos(a)]; });
    parts.push({ kind: 'transfer', pts: toMoon(halo[72], key === 'L1' ? [0.6, -0.3, 0] : [0.9, -0.35, 0]) }, { kind: 'halo', pts: halo });
    parts.push({ kind: 'transfer', pts: bez(halo[24], [H.c[0], 0.06, H.c[2]], [1.02, 0.05, 0], [1, MOON_R, 0], 32) }, ...moon(1));
  } else parts.push({ kind: 'transfer', pts: toMoon([1, -MOON_R, 0]) }, ...moon(key === 'APOLLO11' ? 3 : 1));
  return parts;
}
// kart çizimi (SVG, üstten bakış): yol ve Dünya/Ay noktaları çizime sığdırılır (eşit ölçek, kenar payı). Dönüş { paths: [{ kind, d }], E: [x, y], M: [x, y] }
export function profileSvg(key, w = 132, h = 64, parts = null) {
  const P = parts || profilePath(key), pad = 5;
  let x0 = 0, x1 = 1, y0 = 0, y1 = 0;
  for (const p of P) for (const q of p.pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
  const k = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / Math.max(y1 - y0, 1e-6)), ox = (w - k * (x1 - x0)) / 2, oy = (h - k * (y1 - y0)) / 2;
  const X = (x) => +(ox + (x - x0) * k).toFixed(1), Y = (y) => +(oy + (y1 - y) * k).toFixed(1);
  return { paths: P.map((p) => ({ kind: p.kind, d: 'M' + p.pts.map((q) => X(q[0]) + ' ' + Y(q[1])).join('L') })), E: [X(0), Y(0)], M: [X(1), Y(0)] };
}

// LS19'un gerekçeleri (sayılarla): ctx { defs, cap(roket) → kg|null, lat(yer) → ° }. Dönüş [{ t: metin ({0}…), a: [{ n, d } sayı | metin] }]
export function reasons(step, sel = {}, ctx = {}) {
  const out = [], f0 = (x) => ({ n: x, d: 0 }), f1 = (x) => ({ n: x, d: 1 });                 // sayılar arayüzde dile göre biçimlenir (format.js fmt)
  if (step === 'yer' && ctx.lat) {
    const lat = Math.abs(ctx.lat(sel.site || 'A15'));
    out.push({ t: 'Enlem {0}°: Ay yörüngesinin eğimi en az bu kadar olmalı (yer yörüngenin altından geçsin).', a: [f1(lat)] });
    out.push({ t: lat > 15 ? 'Yüksek enlem: Ay\'a varış penceresi daha seçici; tasarım bir sonraki aya kayabilir.' : 'Ekvatora yakın: her ay uygun pencere bulmak kolay.', a: [] });
  }
  if (step === 'tarih') {
    out.push({ t: 'İniş, yerde Güneş 5°–20° yükselirken olur: uzun gölgeler kraterleri ve kayaları gösterir, yüzey aşırı ısınmaz.', a: [] });
    out.push({ t: 'Bu koşul her yerde ayda bir kez sağlanır: pencere Ay\'ın evresine bağlıdır.', a: [] });
  }
  if (step === 'profil' && (ctx.defs || ctx.stats)) {
    const st = ctx.stats || ((k) => profileStats(ctx.defs, k));
    const S = PROFILE_ORDER.map((k) => [k, st(k)]).filter(([, s]) => s), me = S.find(([k]) => k === (sel.profile || 'APOLLO'));
    if (me) {
      const fast = S.reduce((a, b) => (b[1].days < a[1].days ? b : a)), cheap = S.reduce((a, b) => (b[1].dv < a[1].dv ? b : a));
      out.push(me[0] === fast[0] ? { t: 'En kısa görev: {0} gün.', a: [f1(me[1].days)] } : { t: '{0} gün: en kısadan ({1}) {2} gün uzun.', a: [f1(me[1].days), PROFILE_NOTES[fast[0]].t, f1(me[1].days - fast[1].days)] });
      out.push(Math.abs(me[1].dv - cheap[1].dv) < 3 ? { t: 'En az Δv: {0} m/s (en az yakıt).', a: [f0(me[1].dv)] } : { t: 'Δv {0} m/s: en ucuz profilden {1} m/s fazla (daha çok yakıt, daha ağır araç).', a: [f0(me[1].dv), f0(me[1].dv - cheap[1].dv)] });
      out.push({ t: 'İniş aracı {0} kg (yakıtıyla).', a: [f0(me[1].lander)] });
      const m = me[1]; if (m.landNeed != null && m.landHave != null) out.push(Math.abs(m.landHave - m.landNeed) < 1 ? { t: 'İniş aracının yakıtı bu göreve göre boyutlandı: {0} kg.', a: [f0(m.landNeed)] } : m.landHave >= m.landNeed ? { t: 'İniş yakıtı: gereken {0} kg, araçta {1} kg (pay {2} kg).', a: [f0(m.landNeed), f0(m.landHave), f0(m.landHave - m.landNeed)] } : { t: 'İniş yakıtı yetmez: gereken {0} kg, araçta {1} kg.', a: [f0(m.landNeed), f0(m.landHave)] });
    }
  }
  if (step === 'roket' && ctx.cap) {
    const st = (ctx.stats ? ctx.stats(sel.profile || 'APOLLO') : null) || (ctx.defs && profileStats(ctx.defs, sel.profile || 'APOLLO')), cap = ctx.cap(sel.rocket || 'GENEL');
    if (st && st.tliNeed != null && st.tliHave != null && cap != null && Math.abs(st.tliHave - st.tliNeed) >= 1) out.push(st.tliHave >= st.tliNeed ? { t: 'Bu görevde TLI yakıtı: gereken {0} kg, kademede {1} kg.', a: [f0(st.tliNeed), f0(st.tliHave)] } : { t: 'TLI yakıtı yetmez: gereken {0} kg, kademede {1} kg.', a: [f0(st.tliNeed), f0(st.tliHave)] });
    if (cap == null) out.push({ t: 'Genel kademe yakıtını göreve göre boyutlar: her profil için yeter; hazır tasarımlar bununla.', a: [] });
    else if (st) out.push(cap >= st.lander ? { t: 'Ay yoluna {0} kg taşır: aracın {1} katı.', a: [f0(cap), f1(cap / st.lander)] } : { t: 'Ay yoluna {0} kg: aracın {1} kg\'ına yetmez.', a: [f0(cap), f0(st.lander)] });
    out.push({ t: 'Kalkış canlandırması roketin kendi rampasından ve kendi kademe düzeniyle oynar.', a: [] });
  }
  return out;
}

// brifing çizelgesi: görevin ana anları (fırlatmadan T+ ile). Halo profillerinde halo yörüngesine giriş ve ayrılış da
export function briefTimeline(D) {
  if (!D || !D.LAUNCH) return [];
  const t0 = D.LAUNCH.t_launch, out = [['Fırlatma', t0]];
  if (D.TLI && D.TLI.t_ign) out.push(['Ay\'a aktarma yakışı (TLI)', D.TLI.t_ign]);
  if (D.ARRIVAL && D.ARRIVAL.t_P) out.push([D.HALO ? 'Halo yörüngesine giriş' : 'Ay yörüngesine giriş (LOI)', D.ARRIVAL.t_P]);
  if (D.HALO && D.HALO.tDep) out.push(['Halodan ayrılış', D.HALO.tDep]);
  if (D.t_L != null) out.push(['İniş', D.t_L]);
  return out.filter(([, t]) => Number.isFinite(t)).sort((a, b) => a[1] - b[1]).map(([k, t]) => ({ k, t, dt: t - t0 }));
}
// T+ süre metni: g sa dk (UNIT dile göre arayüzde; burada sayılar)
export const tPlus = (s) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return { d, h, m }; };
