// Laboratuvar arayüzünün saf yardımcıları (DOM ve THREE yok; Node'da sınanır): düz dille biçimleme, itki zamanı seçenekleri, sonuç yargısı.
import { fmt } from './format.js';
import { AU, etFromJd, jdFromEt, kineticDv } from './deflect.js';
import { MONTHS } from './i18n.js';

export const LD = 384399;                                    // Ay uzaklığı, km
const AYLAR = MONTHS;

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

// kütleçekimsel olmayan model (deflect.js ngFromSbdb) → kısa açıklama: "Yarkovsky A2 = −2,90×10⁻¹⁴ AB/gün²"
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sci = (x, n = 3) => { if (!(x !== 0 && Number.isFinite(x))) return fmt(x || 0, 0); const e = Math.floor(Math.log10(Math.abs(x))), m = x / 10 ** e; return `${fmt(m, n - 1)}×10${String(e).replace(/./g, (c) => SUP[c] || c)}`; };
export const ngText = (ng) => (ng && ng.A2 ? `Yarkovsky A2 = ${sci(ng.A2)} AB/gün²` : ng ? 'kütleçekimsel olmayan ivme (JPL)' : '');

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
const LEADS = [['10y', '10 yıl', 3652.5], ['5y', '5 yıl', 1826.25], ['2y', '2 yıl', 730.5], ['1y', '1 yıl', 365.25], ['3m', '3 ay', 91.3125]];
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

// ---------------------------------------------------------------- paylaşılabilir bağlantı ve deneme geçmişi
// Saptırma deneyinin tüm ayarları adres parametrelerine yazılır: bağlantıyı açan aynı hedefi tarar, aynı geçişi seçer ve aynı itkiyi hesaplar.
//   hedef (SBDB tanımı), bas (tarama başlangıcı), yil (tarama süresi), gecis (yakın geçiş günü), yontem (kin | sur), m, U, beta | F, gun,
//   itki (itki günü), yon, senaryo (gercek | varsayim), D, rho (yalnız kullanıcı değiştirdiyse)
export const LINK_KEYS = ['hedef', 'bas', 'yil', 'gecis', 'yontem', 'm', 'U', 'beta', 'F', 'gun', 'itki', 'yon', 'senaryo', 'D', 'rho'];
const ISO_DAY = /^\d{4}-\d\d-\d\d$/;
const num = (s) => (s != null && s !== '' && Number.isFinite(+s) ? +s : null);
// s: { des, start, years, caDay, method, m, U, beta, F, days, applyDay, dir, hypo, D?, rho? } → { anahtar: metin }
export function linkFromState(s) {
  const o = { hedef: s.des, bas: s.start, yil: String(s.years), gecis: s.caDay, yontem: s.method === 'thrust' ? 'sur' : 'kin' };
  if (s.method === 'thrust') Object.assign(o, { F: String(s.F), gun: String(s.days) }); else Object.assign(o, { m: String(s.m), U: String(s.U), beta: String(s.beta) });
  Object.assign(o, { itki: s.applyDay, yon: s.dir, senaryo: s.hypo ? 'varsayim' : 'gercek' });
  if (s.D > 0 && s.rho > 0) Object.assign(o, { D: String(s.D), rho: String(s.rho) });
  return o;
}
// adres parametreleri (URLSearchParams ya da düz nesne) → durum ya da null (hedef yoksa). Geçersiz alanlar atılır, eksikler varsayılana kalır.
export function stateFromLink(q) {
  const get = (k) => (typeof q.get === 'function' ? q.get(k) : q[k]);
  const des = (get('hedef') || '').trim().slice(0, 40); if (!des) return null;
  const day = (k) => { const v = get(k); return v && ISO_DAY.test(v) ? v : null; };
  const yontem = get('yontem'), yon = get('yon'), sc = get('senaryo');
  const s = { des, start: day('bas'), years: num(get('yil')), caDay: day('gecis'), method: yontem === 'sur' ? 'thrust' : 'kinetic', applyDay: day('itki'),
    dir: Object.hasOwn(DIRS, yon || '') ? yon : null, hypo: sc === 'varsayim' ? true : sc === 'gercek' ? false : null };
  for (const k of ['m', 'U', 'beta', 'F', 'D', 'rho']) { const v = num(get(k)); s[k] = v != null && v > 0 ? v : null; }
  const g = num(get('gun')); s.days = g != null && g > 0 ? g : null;
  if (s.years != null) s.years = Math.max(1, Math.min(120, Math.round(s.years)));
  return s;
}
// bir hesabın geçmiş satırı (deflectwork sonucu r, gönderilen parametreler p, hedef t, bağlantı link)
export function historyRow(r, p, t, link) {
  const v = verdictOf(r, p), dB = Math.hypot(r.dXi, r.dZeta);
  return { at: Date.now(), name: t.name, des: t.des, caEt: r.ca.et, caDist: r.ca.dist, method: p.method, how: p.method === 'kinetic' ? `${fmt(p.m, 0)} kg × ${fmt(p.U, 1)} km/s` : `${sig(p.F, 2)} N × ${fmt(p.days, 0)} gün`,
    leadDays: r.leadDays, dvMps: r.dvMps, shiftKm: dB, bEKm: r.b0.bE, hypo: !!p.hypo, kind: v.kind, title: v.title, link };
}
// geçmiş → CSV (virgülle ayrılmış, RFC 4180 tırnaklama; sayılar nokta ondalıklı ki tablolama programları okusun)
export function historyCsv(rows) {
  const q = (x) => { const s = String(x ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['tarih', 'hedef', 'tanim', 'yakin_gecis_utc', 'gecis_km', 'yontem', 'itki', 'once_gun', 'dv_mm_s', 'kayma_km', 'yakalama_yaricapi_km', 'senaryo', 'sonuc', 'baglanti'];
  const lines = rows.map((h) => [new Date(h.at).toISOString(), h.name, h.des, etToISO(h.caEt), h.caDist.toFixed(1), h.method, h.how, h.leadDays.toFixed(1), (h.dvMps * 1000).toPrecision(4),
    h.shiftKm.toFixed(1), h.bEKm.toFixed(1), h.hypo ? 'carpacak_olsaydi' : 'gercek', h.title, h.link].map(q).join(','));
  return [head.join(','), ...lines].join('\n') + '\n';
}

// ---------------------------------------------------------------- belirsizlik (uncert.js Monte Carlo sonucu → düz dil)
// olasılık → yüzde sayısı ("%" şablondadır: çeviride "{0}%" olur); 4.000 örnekte en küçük adım %0,025
const pct = (p) => (p <= 0 ? '0' : p >= 1 ? '100' : fmt(100 * p, p < 0.01 || p > 0.99 ? 2 : p < 0.1 || p > 0.9 ? 1 : 0));
export const sigPct = (s) => fmt(100 * (Math.exp(s) - 1), 0);                         // ln-σ → yüzde (çarpımsal 1σ)
// mc: monteCarlo sonucu; o: { hypo, sM, sBeta, sDv, method, SB (2×2 ya da null), dvReqMps, M, p (parametreler) }
// Dönüş: { kind, title, detail: [cümle…] } (cümleler arayüzde ayrı metin düğümleri: çeviri her cümleyi ayrı eşler)
export function uncertText(mc, o) {
  const src = o.method === 'kinetic' ? `Hız değişiminde kütle (1σ %${sigPct(o.sM)}) ve β (1σ %${sigPct(o.sBeta)}) belirsiz.` : `Hız değişiminde kütle (1σ %${sigPct(o.sM)}) belirsiz.`;
  const range = `Kayma %90 olasılıkla ${kmText(mc.shiftQ[0])} – ${kmText(mc.shiftQ[2])}.`;
  if (o.hypo) {
    const pm = 1 - mc.pImpact, kind = pm >= 0.95 ? 'good' : pm < 0.5 ? 'bad' : 'warn';
    const dv95 = o.dvReqMps * Math.exp(1.6449 * o.sDv);
    const need = o.method === 'kinetic' ? `%95 güvenle kurtarmak için Δv ≈ ${sig(dv95 * 1000, 3)} mm/s: ≈ ${sig(dv95 * o.M / (o.p.beta * o.p.U * 1000), 3)} kg'lık çarpıcı.`
      : `%95 güvenle kurtarmak için Δv ≈ ${sig(dv95 * 1000, 3)} mm/s.`;
    return { kind, title: `Belirsizlikle: %${pct(pm)} olasılıkla ıskalar`, detail: [src, range, need] };
  }
  const orbit = o.SB ? `Geçiş noktasının yörünge belirsizliği (1σ) ≈ ${kmText(Math.sqrt(Math.max(o.SB[0][0], o.SB[1][1], 0)))} (JPL kovaryansı).` : 'Yörünge kovaryansı yok: yalnız itkinin belirsizliği hesaba katıldı.';
  const kind = mc.pImpact < mc.pImpact0 ? 'good' : mc.pImpact > mc.pImpact0 ? 'bad' : 'info';
  return { kind, title: `Çarpma olasılığı: itkisiz %${pct(mc.pImpact0)} → itkili %${pct(mc.pImpact)}`, detail: [orbit, src, range] };
}
