// Lagrange noktaları brifinginin saf mantığı (DOM yok; Node'da sınanır: test/test_briflagrange.js). Arayüz: briflagrange.js.
// Akış: 1 Hangi sistem? → 2 Hangi nokta? → 3 Ne kadar hata? (konum hatası, izleme süresi) → 4 Brifing (sonuç).
// Sayılar lagrange.js'ten (CR3BP: doğrusal kuram ve tümleme); burada yalnız öneri, gerekçe ve seçenek listeleri.
import * as G from './lagrange.js';
import { fmt } from './format.js';

export const LG_STEPS = [
  { k: 'sistem', t: 'Hangi sistem?', s: 'Sistem' },
  { k: 'nokta', t: 'Hangi nokta?', s: 'Nokta' },
  { k: 'deney', t: 'Ne kadar hata?', s: 'Deney' },
  { k: 'brifing', t: 'Brifing', s: 'Sonuç' },
];
export const LG_SYSTEMS = {
  em: { t: 'Dünya–Ay', s: 'Ay\'a giden araçların sistemi. L1 ve L2\'nin çevresinde halo yörüngeleri var; Artemis\'in Gateway istasyonu L2 ailesinin NRHO üyesinde duracak.' },
  se: { t: 'Güneş–Dünya', s: 'L1\'de SOHO Güneş\'i izler, L2\'de James Webb Uzay Teleskobu durur; L4 çevresinde Dünya\'nın Truva asteroitleri salınır.' },
};
export const LG_ORDER = ['em', 'se'];
export const POINT_IDS = ['L1', 'L2', 'L3', 'L4', 'L5'];
// noktaların bilinen sakinleri (gerçek görevler ve cisimler)
export const RESIDENTS = {
  em: { L1: 'Dünya ile Ay arasında; ARTEMIS sondaları 2010–2011\'de L1 ve L2 çevresinde Lissajous yörüngelerinde dolandı.', L2: 'Ay\'ın arkasında; Gateway\'in NRHO\'su bu ailededir, Chang\'e 4\'ün röle uydusu Queqiao bu noktanın çevresinde.',
    L3: 'Dünya\'nın öbür yanında, Ay\'ın karşısında.', L4: 'Ay\'ın 60° önünde; Kordylewski toz bulutları burada olabilir.', L5: 'Ay\'ın 60° arkasında; Kordylewski toz bulutları burada olabilir.' },
  se: { L1: 'Güneş\'e doğru 1,5 milyon km: SOHO, ACE, DSCOVR burada Güneş rüzgârını Dünya\'dan önce ölçer.', L2: 'Güneş\'in tersine 1,5 milyon km: James Webb ve Euclid burada; Güneş, Dünya ve Ay hep aynı yanda kalır.',
    L3: 'Güneş\'in ardında: Dünya\'dan hiç görülmez.', L4: 'Dünya\'nın 60° önünde: bilinen iki Truva asteroidi (2010 TK7, 2020 XL5) bunun çevresinde salınır.', L5: 'Dünya\'nın 60° arkasında: burada bilinen bir Truva asteroidi yok.' },
};
export const ERRORS_KM = [0.1, 1, 10, 100];
export const DAYS = { em: [30, 60, 180], se: [180, 365, 730] };

// noktaların özeti (sistem birimleriyle): lagrange.js pointInfo
export function pointsOf(sys) { return G.points(sys.mu).map((p) => G.pointInfo(p, sys)); }
// doğrusal kurama göre noktanın yakınından çıkış süresi (gün): d(t) = d0·e^(t/τ) → t = τ·ln(yakın / d0); kararlı noktada null
export function leaveDays(I, nearKm, d0Km) { return I.efoldDays == null || !(d0Km > 0) ? null : I.efoldDays * Math.log(Math.max(1, nearKm / d0Km)); }
// izleme süresi önerisi: kararsızda öngörülen çıkışın en az 1,5 katı; kararlıda en uzun salınımın en az 1,5 katı (sınırlı: seçeneklerin en uzunu)
export function daysFor(sysId, I, nearKm, d0Km) {
  const opts = DAYS[sysId] || DAYS.em, need = I.efoldDays != null ? 1.5 * leaveDays(I, nearKm, d0Km) : Math.min(1.5 * Math.max(...I.oscDays), opts[opts.length - 1]);
  return opts.find((d) => d >= need) || opts[opts.length - 1];
}

// LS19 önerisi: { v, why, a }
export function recommendLg(step, sel, ctx = {}) {
  switch (step) {
    case 'sistem': return { v: 'em', why: 'Dünya–Ay: araç kararsız noktadan birkaç günde ayrılır, kararsızlık gözünün önünde büyür. Halo yörüngeleri ve Artemis\'in Gateway\'i de burada.' };
    case 'nokta': {
      const P = ctx.points || [], fast = P.filter((p) => p.efoldDays != null).reduce((b, p) => (!b || p.efoldDays < b.efoldDays ? p : b), null);
      if (!fast) return null;
      const v = sel.sys === 'se' ? 'L2' : fast.id, I = P.find((p) => p.id === v);
      return { v, why: sel.sys === 'se' ? 'L2: James Webb burada. Kararsız: hata her {0} günde e katına çıkar; teleskop bu yüzden düzenli yörünge düzeltmesi yapar.' : '{1}: en hızlı kararsız nokta. Hata her {0} günde e katına (2,7 katına) çıkar: kararsızlık birkaç günde görülür.', a: [{ n: I.efoldDays, d: 1 }, v] };
    }
    case 'deney': {
      const I = ctx.point; if (!I) return null;
      const days = daysFor(sel.sys, I, ctx.nearKm, 10);
      return { v: '10|' + days, why: I.efoldDays != null ? '10 km konum hatası, {0} gün izleme: kurama göre araç {1} gün sonra noktanın yakınından çıkar.' : '10 km konum hatası, {0} gün izleme: kararlı noktada araç salınır; en uzun salınım {2} gün.', a: [{ n: days, d: 0 }, { n: leaveDays(I, ctx.nearKm, 10) || 0, d: 1 }, { n: Math.max(...I.oscDays), d: 0 }] };
    }
    default: return null;
  }
}

// seçimin gerekçesi, sayılarla
export function reasonsLg(step, sel, ctx = {}) {
  const out = [], sys = ctx.sys;
  if (step === 'sistem' && sys) {
    const P = ctx.points, L1 = P[0], L2 = P[1];
    out.push({ t: 'Kütle oranı μ = {0}: küçük cisim sistemin kütlesinin bu kadarı.', a: [sys.mu >= 1e-3 ? fmt(sys.mu, 5) : sys.mu.toExponential(2).replace('.', ',')] });
    out.push({ t: 'L1 ve L2 küçük cisme {0} ve {1} uzakta.', a: [G.fmtKm(L1.d2Km), G.fmtKm(L2.d2Km)] });
    out.push({ t: 'L1\'de hata her {0} günde e katına çıkar; L4 ve L5 kararlıdır (μ < 0,0385, Routh ölçütü).', a: [{ n: L1.efoldDays, d: L1.efoldDays < 10 ? 1 : 0 }] });
  } else if (step === 'nokta' && ctx.point) {
    const I = ctx.point;
    out.push({ t: '{0}: küçük cisme {1}, büyük cisme {2}.', a: [I.id, G.fmtKm(I.d2Km), G.fmtKm(I.d1Km)] });
    if (I.efoldDays != null) out.push({ t: 'Kararsız: küçük bir hata her {0} günde e katına çıkar (doğrusal kuram).', a: [{ n: I.efoldDays, d: I.efoldDays < 10 ? 2 : 1 }] });
    else out.push({ t: 'Kararlı: araç noktanın çevresinde {0} ve {1} günlük salınımlarla dolanır.', a: [{ n: Math.max(...I.oscDays), d: 0 }, { n: Math.min(...I.oscDays), d: 1 }] });
    if (RESIDENTS[sel.sys] && RESIDENTS[sel.sys][I.id]) out.push({ t: RESIDENTS[sel.sys][I.id], a: [] });
  } else if (step === 'deney' && ctx.point) {
    const I = ctx.point, r = ctx.run, lv = leaveDays(I, ctx.nearKm, sel.errKm);
    out.push({ t: 'Noktanın "yakını": küçük cisme L1 uzaklığının yarısı, {0}.', a: [G.fmtKm(ctx.nearKm)] });
    if (lv != null) out.push({ t: 'Kurama göre {0} hata, {1} gün sonra bu sınırı aşar (τ·ln(sınır / hata)).', a: [G.fmtKm(sel.errKm), { n: lv, d: 1 }] });
    if (r) out.push(r.tLeave != null ? { t: 'Tümleme: araç {0} gün sonra ayrıldı, en çok {1} uzaklaştı.', a: [{ n: r.tLeave, d: 1 }, G.fmtKm(r.maxKm)] } : { t: 'Tümleme: {0} gün boyunca noktadan en çok {1} uzaklaştı.', a: [{ n: r.tEnd, d: 0 }, G.fmtKm(r.maxKm)] });
    if (lv != null) out.push({ t: 'Hatayı 10 kat küçültmek yalnız {0} gün kazandırır: kararsızlık üsteldir.', a: [{ n: I.efoldDays * Math.log(10), d: 1 }] });
  }
  return out;
}
