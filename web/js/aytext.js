// Laboratuvar › Ay görevi deneyinin saf yardımcıları (DOM yok, Node'da sınanır: test/test_ayexp.js): adım özetleri ve sonuç yargısı.
// Fizik buradan hesaplanmaz: temasın başarılı sayılıp sayılmadığı mission.js'in touchdown() kararıdır (result.ok); burada yalnız düz dille anlatılır.
import { fmt } from './format.js';
import { ROCKETS } from './rockets.js';
const rocketShort = (id) => (id && id !== 'GENEL' && ROCKETS[id] ? ROCKETS[id].short : '');

// Ay görevi deneyinin dört adımı (index.html #lab-ay: sekme kimlikleri tab-<id>); "dv" eski ?tab=dv bağlantılarıyla uyum için Sonuç adımının kimliğidir
export const AY_STEPS = [
  { id: 'gorev', n: 1, title: 'Görev' },
  { id: 'arac', n: 2, title: 'Araç ve güdüm' },
  { id: 'ucus', n: 3, title: 'Uçuş' },
  { id: 'dv', n: 4, title: 'Sonuç' },
];
// Uçuş adımının aletleri (iç sekmeler)
export const AY_TOOLS = ['plan', 'kontrol', 'grafik', 'yorunge', 'efemeris'];

export const VEHICLE_SHORT = { two: 'İki kademe', one: 'Tek kademe' };
export const LANDING_SHORT = { opt: 'Optimal', free: 'Optimal (serbest)', zem: 'ZEM/ZEV' };
// mission.js touchdown(): güvenli temas sınırları (anlatım için; karar result.ok'tan okunur)
export const SAFE_VZ = 3.0, SAFE_VH = 1.22;

const AY = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
// '2026-10-13' → '13 Eki 2026'
export function dateShort(iso) {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ''); if (!m) return '';
  return `${+m[3]} ${AY[+m[2] - 1]} ${m[1]}`;
}
// profil adının kısa biçimi (özet satırı dar): parantezli ayrıntı ve ":"den sonrası atılır ("Artemis: NRHO 9:2 bekleme…" → "Artemis")
export function profileShort(name) {
  if (!name) return 'Özel';
  return name.replace(/\s*\(.*$/, '').replace(/:\s.*$/, '').replace(/,.*$/, '').trim() || name;
}

// 1. adım özeti: profil · tarih (tasarlanıyorsa onu söyler)
export function sumGorev({ profileName, dateISO, designing }) {
  if (designing) return 'Tasarlanıyor…';
  return [profileShort(profileName), dateShort(dateISO)].filter(Boolean).join(' · ');
}
// 2. adım özeti: araç · güdüm (konik çözücü yoksa optimal güdüm ZEM/ZEV'e düşer)
//   rocket: rockets.js kimliği (genel kademe yazılmaz)
export function sumArac({ vehicle, landing, optimalOk = true, rocket = null }) {
  const g = optimalOk ? landing : 'zem';
  return [rocketShort(rocket), VEHICLE_SHORT[vehicle] || vehicle, LANDING_SHORT[g] || g].filter(Boolean).join(' · ');
}
// 3. adım özeti: uçuşun durumu
//   started: görev saati başlangıç anından ilerledi mi (görev park yörüngesinde, fırlatmadan dakikalar sonra başlar: met > 0 ama henüz uçulmadı)
export function sumUcus({ designing, ready, running, done, met, started = true }) {
  if (designing || !ready) return 'Görev kuruluyor';
  if (done) return 'Uçuş bitti';
  if (!running && !started) return 'Hazır: Başlat';
  if (met == null || met < 0) return running ? 'Fırlatma sayımı' : 'Hazır: Başlat';
  return (running ? '' : 'Duraklatıldı · ') + 'T+' + durShort(met);
}
// 4. adım özeti
export function sumSonuc({ done, result }) {
  if (!done || !result) return 'İnişte belli olur';
  if (result.reentry) return 'Atmosfere girdi';
  return result.ok ? `İniş ✓ · ${fmt(result.prop, 0)} kg yakıt` : 'Sert temas';
}
// '1g 04:12' / '04:12:30' (özet satırı için kısa süre)
export function durShort(s) {
  s = Math.max(0, s);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), z = (x) => String(x).padStart(2, '0');
  return d ? `${d}g ${z(h)}:${z(m)}` : `${z(h)}:${z(m)}:${z(sec)}`;
}

// Sonuç kartı: { kind: 'good'|'bad'|'info', title, detail, rows: [[ad, değer], …] }
//   result: mission.js result (null: görev sürüyor); dvUsed: kullanılan toplam Δv (m/s); dvNominal: aynı görevin bozulmasız otopilot toplamı (m/s, yoksa null)
export function verdict(result, { dvUsed = null, dvNominal = null, profileName = '', vehicle = 'two', landing = 'opt', rocket = null } = {}) {
  if (!result) return { kind: 'info', title: 'Görev sürüyor', detail: 'Sonuç Ay yüzeyine temasla belli olur. Uçuş adımında Başlat ile görevi uçurun; zaman hızı ya da çizelgedeki olaya atlama uçuşu kısaltır.', rows: [] };
  if (result.reentry) return { kind: 'bad', title: 'Görev sona erdi', detail: 'Araç Dünya atmosferine girdi: yörünge Ay\'a ulaşmadı. Elle yakışları ya da bozulmaları geri alıp görevi baştan uçurun.', rows: [] };
  const [ex, ey] = result.posErr_m || [NaN, NaN], [vx, vy, vz] = result.v_mps || [NaN, NaN, NaN];
  const pos = Math.hypot(ex, ey), vh = Math.hypot(vx, vy);
  const rows = [
    ['İniş yerine uzaklık', pos < 1000 ? fmt(pos, 1) + ' m' : fmt(pos / 1000, 2) + ' km'],
    ['Dikey hız', fmt(Math.abs(vz), 2) + ' m/s' + (Math.abs(vz) < SAFE_VZ ? '' : ' (sınır ' + fmt(SAFE_VZ, 1) + ')')],
    ['Yatay hız', fmt(vh, 2) + ' m/s' + (vh < SAFE_VH ? '' : ' (sınır ' + fmt(SAFE_VH, 2) + ')')],
    ['Kalan yakıt', fmt(result.prop, 0) + ' kg'],
  ];
  if (Number.isFinite(dvUsed)) rows.push(['Kullanılan Δv', fmt(dvUsed, 1) + ' m/s']);
  if (Number.isFinite(dvUsed) && Number.isFinite(dvNominal) && dvNominal > 0) {
    const d = dvUsed - dvNominal;
    rows.push(['Nominale göre', Math.abs(d) < 0.05 ? 'aynı' : (d > 0 ? '+' : '−') + fmt(Math.abs(d), 1) + ' m/s']);
  }
  const setup = [rocketShort(rocket), profileShort(profileName), VEHICLE_SHORT[vehicle], LANDING_SHORT[landing]].filter(Boolean).join(', ');
  if (result.ok) {
    return { kind: 'good', title: 'İniş başarılı', rows,
      detail: `${setup ? setup + ': ' : ''}araç iniş yerine ${rows[0][1]} uzaklıkta, güvenli hızla (dikey < ${fmt(SAFE_VZ, 1)}, yatay < ${fmt(SAFE_VH, 2)} m/s) yere değdi${result.manual ? ' (elle iniş)' : ''}. Başka bir profil ya da güdümle karşılaştırın.` };
  }
  return { kind: 'bad', title: 'Sert temas', rows,
    detail: `Temas hızı güvenli sınırı aştı (dikey < ${fmt(SAFE_VZ, 1)}, yatay < ${fmt(SAFE_VH, 2)} m/s). ${result.manual ? 'Elle inişte son yüz metrede itkiyi artırıp dikey hızı düşürün ya da otopilotla deneyin.' : 'Bozulma eklendiyse ya da yakıt yetmediyse görevi baştan uçurun ya da başka bir güdüm deneyin.'}` };
}
