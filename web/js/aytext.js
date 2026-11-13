// Laboratuvar › Ay görevi deneyinin saf yardımcıları (DOM yok, Node'da sınanır: test/test_ayexp.js): adım özetleri ve sonuç yargısı.
// Fizik buradan hesaplanmaz: temasın başarılı sayılıp sayılmadığı mission.js'in touchdown() kararıdır (result.ok); burada yalnız düz dille anlatılır.
import { fmt } from './format.js';
import { ROCKETS } from './rockets.js';
import { MONTHS_SHORT } from './i18n.js';
import { TOUCH, velEnvelope } from './touchdown.js';
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

const VEHICLE_SHORT = { two: 'İki kademe', one: 'Tek kademe' };
const LANDING_SHORT = { opt: 'Optimal', free: 'Optimal (serbest)', zem: 'ZEM/ZEV' };
// mission.js touchdown(): güvenli temas zarfı (anlatım için; karar result.ok'tan okunur). İniş takımının hız zarfı (NASA TN D-6850, touchdown.js):
// dikey 10 ft/s (3,05 m/s) yatay hız yokken, yatay 4 ft/s'de (1,22 m/s) dikey 7 ft/s (2,13 m/s); aradaki dikey sınır yatay hızla doğrusal azalır.
export const SAFE_VZ = TOUCH.VZ0, SAFE_VH = TOUCH.VH;

const AY = MONTHS_SHORT;
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
function durShort(s) {
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
  const pos = Math.hypot(ex, ey), vh = Math.hypot(vx, vy), vzMax = velEnvelope(vz, vh).vzMax;
  const rows = [
    ['İniş yerine uzaklık', pos < 1000 ? fmt(pos, 1) + ' m' : fmt(pos / 1000, 2) + ' km'],
    ['Dikey hız', fmt(Math.abs(vz), 2) + ' m/s' + (Math.abs(vz) <= vzMax ? '' : ' (sınır ' + fmt(vzMax, 2) + ')')],
    ['Yatay hız', fmt(vh, 2) + ' m/s' + (vh <= SAFE_VH ? '' : ' (sınır ' + fmt(SAFE_VH, 2) + ')')],
    ['Kalan yakıt', fmt(result.prop, 0) + ' kg'],
  ];
  if (Number.isFinite(result.tilt_deg)) rows.push(['Temasta eğim', fmt(result.tilt_deg, 1) + '°' + (result.tilt_deg <= TOUCH.TILT ? '' : ' (3σ zarfı ' + fmt(TOUCH.TILT, 0) + '°)')]);
  if (Number.isFinite(result.rate_dps)) rows.push(['Temasta açısal hız', fmt(result.rate_dps, 1) + '°/s' + (result.rate_dps <= TOUCH.RATE ? '' : ' (3σ zarfı ' + fmt(TOUCH.RATE, 0) + '°/s)')]);
  if (result.tip) rows.push(['Devrilme payı', !result.tip.stable ? 'yok: araç devrildi' : result.tip.margin > 100 ? '> 100×' : fmt(result.tip.margin, 1) + '×']);
  if (Number.isFinite(dvUsed)) rows.push(['Kullanılan Δv', fmt(dvUsed, 1) + ' m/s']);
  if (Number.isFinite(dvUsed) && Number.isFinite(dvNominal) && dvNominal > 0) {
    const d = dvUsed - dvNominal;
    rows.push(['Nominale göre', Math.abs(d) < 0.05 ? 'aynı' : (d > 0 ? '+' : '−') + fmt(Math.abs(d), 1) + ' m/s']);
  }
  const setup = [rocketShort(rocket), profileShort(profileName), VEHICLE_SHORT[vehicle], LANDING_SHORT[landing]].filter(Boolean).join(', ');
  if (result.ok) {
    return { kind: 'good', title: 'İniş başarılı', rows,
      detail: `${setup ? setup + ': ' : ''}araç iniş yerine ${rows[0][1]} uzaklıkta, güvenli hızla (dikey < ${fmt(SAFE_VZ, 1)}, yatay < ${fmt(SAFE_VH, 2)} m/s) yere değdi${result.manual ? ' (elle iniş)' : ''}.${result.grade === 'marginal' ? ' Temas yönelimi ya da açısal hızı iniş takımının sınandığı 3σ zarfının dışındaydı (sınırda iniş).' : ''} Başka bir profil ya da güdümle karşılaştırın.` };
  }
  if (result.tip && !result.tip.stable && !(result.env && result.env.vel === false)) {
    return { kind: 'bad', title: 'Araç devrildi', rows,
      detail: `Temas hızı zarf içindeydi ama yatay hız, açısal hız ve yatıklığın taşıdığı enerji aracı ayaklarının üstünden devirmeye yetti. ${result.manual ? 'Elle inişte son metrelerde yatay hızı ve yatıklığı sıfırlayın.' : 'Bozulma eklendiyse ya da seyrüsefer hatası büyükse görevi baştan uçurun.'}` };
  }
  return { kind: 'bad', title: 'Sert temas', rows,
    detail: `Temas hızı güvenli sınırı aştı (dikey < ${fmt(SAFE_VZ, 1)}, yatay < ${fmt(SAFE_VH, 2)} m/s). ${result.manual ? 'Elle inişte son yüz metrede itkiyi artırıp dikey hızı düşürün ya da otopilotla deneyin.' : 'Bozulma eklendiyse ya da yakıt yetmediyse görevi baştan uçurun ya da başka bir güdüm deneyin.'}` };
}

// ---------------------------------------------------------------- görev iptali (abort.js sonucu → düz dil)
// now: şimdi yakılırsa, win: en iyi an (sonraki yörünge periyodu ya da 6 saat), dvLeft: aracın kalan Δv'si (m/s), t: şimdi, utc(t) → metin
// Dönüş: { kind, title, rows: [[etiket, değer]…] }
export function abortSummary({ now, win, dvLeft, t, utc, halo = false }) {
  const r = abortSummaryCore({ now, win, dvLeft, t, utc });
  if (halo) r.rows.push(['Kapsam', 'Halo/NRHO: yalnız tek yakışlık doğrudan dönüş arandı; iki yakışlı, Ay yakın geçişli (Artemis) yol daha ucuz olabilir']);
  return r;
}
function abortSummaryCore({ now, win, dvLeft, t, utc }) {
  const days = (a, b) => `${fmt((b - a) / 86400, 1)} gün`, rows = [];
  const line = (x) => `${fmt(x.dvMag, 0)} m/s → Dünya'ya giriş ${utc(x.tEntry)} (yakıştan ${days(x.tBurn, x.tEntry)} sonra)`;
  if (now && now.ok && now.free) return { kind: 'good', title: 'Serbest dönüş: yakış gerekmez', rows: [['Şimdiki yörünge', `Kendiliğinden Dünya'ya döner: boşluk perijesi ${fmt(now.hp, 0)} km, giriş ${utc(now.tEntry)}`]] };
  rows.push(['Şimdi yakılırsa', now && now.ok ? line(now) : 'Bu anda tek yakışla dönüş yok (yörüngenin uygun noktası beklenmeli)']);
  if (win && win.ok) rows.push([`En iyi an (sonraki ${fmt(win.period / 60, 0)} dk içinde)`, `+${fmt((win.tBurn - t) / 60, 0)} dk: ${line(win)}`]);
  const need = [now, win].filter((x) => x && x.ok).reduce((m, x) => Math.min(m, x.dvMag), Infinity);
  if (Number.isFinite(dvLeft)) rows.push(['Aracın kalan Δv\'si', `${fmt(dvLeft, 0)} m/s`]);
  if (!Number.isFinite(need)) return { kind: 'bad', title: 'Dönüş yolu bulunamadı', rows };
  if (!Number.isFinite(dvLeft)) return { kind: 'info', title: `Dönüş için en az ${fmt(need, 0)} m/s`, rows };
  return need <= dvLeft ? { kind: 'good', title: `Eve dönülebilir: ${fmt(need, 0)} m/s gerekli, ${fmt(dvLeft, 0)} m/s var`, rows }
    : { kind: 'bad', title: `Kalan Δv yetmez: ${fmt(need, 0)} m/s gerekli, ${fmt(dvLeft, 0)} m/s var`, rows };
}
