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
  const p = defs && defs.profiles && defs.profiles[key]; if (!p || !p.design) return null;
  const D = p.design, dv = Object.values(D.DV || {}).filter((v) => Number.isFinite(v)).reduce((a, b) => a + b, 0);
  const days = D.t_L != null && D.LAUNCH ? (D.t_L - D.LAUNCH.t_launch) / 86400 : null;
  const lander = (D.STAGES || []).slice(1).reduce((q, s) => q + (s.dry || 0) + (s.prop || 0), 0);
  return { dv, days, lander };
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
// Bağlantıyla ya da ayarlı adresle gelen (görev anahtarları, sekme, fragman) brifingi görmez: bağlantı görevi doğrudan kurar.
export function briefKind({ search = '', visited = false, view = 'lab', exp = 'ay' } = {}) {
  const q = new URLSearchParams(search);
  if (q.get('brifing') === '0') return null;
  if (q.get('brifing') === '1') return visited ? 'return' : 'new';
  if (view !== 'lab' || (exp && exp !== 'ay')) return null;
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
