// Laboratuvar arayüzünün saf yardımcıları (DOM ve THREE yok; Node'da sınanır): düz dille biçimleme, itki zamanı seçenekleri, sonuç yargısı.
import { fmt } from './format.js';
import { AU, etFromJd, jdFromEt, kineticDv } from './deflect.js';

export const LD = 384399;                                    // Ay uzaklığı, km
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

// n anlamlı basamakla düz sayı (bilimsel gösterim yok; ondalık sayısı büyüklüğe göre)
export const sig = (x, n = 3) => { if (!Number.isFinite(x)) return '—'; if (x === 0) return '0'; const d = Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x)))); return fmt(x, Math.min(d, 9)); };
export const kmText = (v) => (Math.abs(v) >= 1e6 ? `${sig(v / 1e6, 3)} milyon km` : `${fmt(v, Math.abs(v) >= 100 ? 0 : 1)} km`);
export const distText = (v) => (v > 0.02 * AU ? `${sig(v / AU, 4)} AB` : `${kmText(v)} (${sig(v / LD, 3)} AM)`);
// yakın geçiş kartı için: ana değer + sezgisel karşılaştırma
export const caDist = (v) => ({ main: kmText(v), sub: v > 0.02 * AU ? `${sig(v / AU, 3)} AB` : `Ay uzaklığının ${sig(v / LD, 2)} katı` });
export const sizeText = (Dkm) => (!(Dkm > 0) ? '' : Dkm < 1 ? `${fmt(Dkm * 1000, 0)} m` : `${sig(Dkm, 2)} km`);

// TDB saniyesi (J2000'den) ↔ "YYYY-MM-DD[ HH:MM]" (UTC; TDB−UTC ≈ 69,184 s)
export const etFromISO = (s) => etFromJd(Date.parse(s + 'T00:00:00Z') / 86400000 + 2440587.5) + 69.184;
export const etToISO = (et, withTime = true) => { const ms = (jdFromEt(et) - 2440587.5) * 86400000 - 69184; const s = new Date(ms).toISOString(); return withTime ? s.slice(0, 16).replace('T', ' ') : s.slice(0, 10); };
export const dateLong = (et) => { const [y, m, d] = etToISO(et, false).split('-'); return `${+d} ${AYLAR[+m - 1]} ${y}`; };

// tayf türüne göre yoğunluk tahmini (kg/m³)
export const RHO = (spec) => (/^[CBFGD]/.test(spec || '') ? 1400 : /^[SQVAKLR]/.test(spec || '') ? 2600 : /^[MXE]/.test(spec || '') ? 3500 : 2000);

// hızlı hedefler: katalogdaki geçici tanım → görünen ad + tek satırlık neden
export const QUICK_TARGETS = [
  { des: '99942', name: 'Apophis', why: '2029\'da Dünya\'dan ~38.000 km: GEO uydularından da yakın' },
  { des: '101955', name: 'Bennu', why: 'OSIRIS-REx örnek getirdi; 2182 çarpma olasılığı listede' },
  { des: '65803', name: 'Didymos', why: 'DART ona (Dimorphos\'a) çarptı' },
  { des: '2024 YR4', name: '2024 YR4', why: '2032 için çarpma olasılığı yakından izlendi' },
];

// ---------------------------------------------------------------- itki zamanı: "yakın geçişten ne kadar önce?"
export const LEADS = [['10y', '10 yıl', 3652.5], ['5y', '5 yıl', 1826.25], ['2y', '2 yıl', 730.5], ['1y', '1 yıl', 365.25], ['3m', '3 ay', 91.3125]];
// caEt: yakın geçiş (TDB s), minEt: izin verilen en erken itki anı (tarama başlangıcı). ok: tarih aralıkta
export function leadChoices(caEt, minEt) {
  return LEADS.map(([id, label, days]) => { const et = caEt - days * 86400; return { id, label, days, et, ok: et >= minEt && et < caEt - 3600 }; });
}
// varsayılan: 5 yıl, olmazsa 2 yıl, 1 yıl, 3 ay (aralığa sığan en uzun, ama 5 yıldan uzun değil)
export function defaultLead(choices) { return choices.find((c) => c.ok && c.days <= 1826.25) || null; }
export const leadText = (days) => { const y = days / 365.25; return days >= 350 ? `${fmt(y, Math.abs(y - Math.round(y)) < 0.05 ? 0 : 1)} yıl` : days >= 60 ? `${fmt(days / 30.4375, 0)} ay` : `${fmt(days, 0)} gün`; };

// ---------------------------------------------------------------- sonuç yargısı
// r: deflectwork 'deflect' sonucu, p: gönderilen parametreler. kind: good | bad | info
export function verdictOf(r, p) {
  const dB = Math.hypot(r.dXi, r.dZeta), bE = r.b0.bE, hypo = !!p.hypo, base = { dB, bE, hypo };
  if (hypo) {
    const ratio = dB / bE;
    return dB >= bE
      ? { ...base, kind: 'good', ratio, title: 'Dünya kurtulur', detail: `Çarpma rotasındaki asteroit Dünya'yı ${kmText(dB - bE)} farkla ıskalar.` }
      : { ...base, kind: 'bad', ratio, title: 'Bu itki yetmez', detail: `Çarpma noktası yalnızca ${kmText(dB)} kayar; Dünya'yı ıskalatmak için en az ${kmText(bE)} gerekir (%${fmt(100 * ratio, 0)} sağlandı). Daha erken ya da daha güçlü bir itki deneyin.` };
  }
  const rp0 = r.b0.rp, imp0 = !!r.b0.impact, rp1 = r.after ? r.after.rp : null, imp1 = !!(r.after && r.after.impact);
  const move = rp1 == null ? '' : `En yakın geçiş ${distText(rp0)} → ${distText(rp1)}.`;
  if (imp0 && !imp1) return { ...base, kind: 'good', title: 'Çarpma önlendi', detail: move };
  if (!imp0 && imp1) return { ...base, kind: 'bad', title: 'Saptırma çarpmaya yol açtı', detail: move };
  if (imp0 && imp1) return { ...base, kind: 'bad', title: 'Yine çarpar', detail: `${move} İtkiyi büyütün ya da daha erken uygulayın.` };
  return { ...base, kind: 'info', title: 'Dünya\'yı ıskalamaya devam eder', detail: `${move} Geçiş noktası ${kmText(dB)} kaydı.` };
}
// "ne kadar gerekir?" cümlesi (bir yakalama yarıçapı kadar kaydırmak için)
export function needText(r, p) {
  const req = r.dvReqMps;
  if (!(req > 0)) return '';
  return p.method === 'kinetic'
    ? `Bir yakalama yarıçapı (${kmText(r.b0.bE)}) kadar kaydırmak için bu zamanlamayla Δv ≈ ${sig(req * 1000, 3)} mm/s gerekir: aynı hız ve β ile ≈ ${sig(req * r.M / (p.beta * p.U * 1000), 3)} kg'lık bir çarpıcı.`
    : `Bir yakalama yarıçapı (${kmText(r.b0.bE)}) kadar kaydırmak için bu zamanlamayla Δv ≈ ${sig(req * 1000, 3)} mm/s gerekir: ≈ ${sig(r.FreqN, 3)} N × ${fmt(p.days, 0)} gün itki.`;
}

// ---------------------------------------------------------------- adım özetleri (başlık satırı)
export const targetSummary = (t) => (t ? `${t.name}${t.Dkm ? ' · Ø ' + sizeText(t.Dkm) : ''}` : 'Asteroit seçin');
export const caSummary = (c) => (c ? `${dateLong(c.et)} · ${kmText(c.dist)}` : 'Önce bir hedef seçin');
export function pushSummary(p, leadLabel) {
  if (!p) return 'Önce bir yakın geçiş seçin';
  const how = p.method === 'kinetic' ? `Kinetik · ${fmt(p.m, 0)} kg × ${fmt(p.U, 1)} km/s` : `Sürekli · ${sig(p.F, 2)} N × ${fmt(p.days, 0)} gün`;
  return `${how} · ${leadLabel}`;
}
export const DIRS = { along: 'yörünge boyunca (ileri)', anti: 'yörünge boyunca (geri)', best: 'en etkili yön (STM)', radial: 'radyal (Güneş\'ten dışa)', normal: 'yörünge normali' };

// doğrulama notu (DART/Dimorphos ölçümü ile motorun uyumu)
export function dartNote() {
  const M = 4.3e9, dv = kineticDv(579.4, 6.1449, 3.61, M), a = 1206, P = 11.921 * 3600, v = 2 * Math.PI * a / P;
  return `Doğrulama — DART/Dimorphos (2022): 579 kg, 6,14 km/s, β = 3,61, M = 4,3×10⁹ kg → başa baş Δv = ${fmt(dv * 1000, 2)} mm/s. `
    + `Ölçülen yörünge boyu bileşen 2,70 mm/s, ikili yörünge periyodunda ${fmt(3 * P * 2.7e-3 / v / 60, 1)} dk kısalma verir (gözlenen 33,0 ± 1,0 dk). `
    + 'Apophis 2029 yakın geçişi bu motorla JPL CAD değerinden ~2 km farkla bulunur.';
}
