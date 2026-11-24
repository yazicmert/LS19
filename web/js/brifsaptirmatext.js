// Asteroit saptırma brifinginin saf mantığı (DOM yok; Node'da sınanır: test/test_brifsaptirma.js). Arayüz: brifsaptirma.js.
// Akış: 1 Hangi asteroit? → 2 Ne zaman? (yakın geçiş, senaryo) → 3 Nasıl? (yöntem) → 4 Neyle? (roket ve fırlatma ya da itki zamanı) → 5 Brifing (sonuç).
// Sayılar gerçek hesaptan gelir: yakın geçişler ve fırlatma penceresi deflectwork.js'te (tam tümleme, JPL çözümü), Δv tahminleri burada (aynı fizik: deflect.js).
import { fmt } from './format.js';
import { QUICK_TARGETS, kmText, sizeText, leadText, LD, sig } from './labtext.js';
import { G_SI, R_E } from './deflect.js';
import { ROCKETS } from './rockets.js';

export const DF_STEPS = [
  { k: 'hedef', t: 'Hangi asteroit?', s: 'Hedef' },
  { k: 'gecis', t: 'Ne zaman?', s: 'Yakın geçiş' },
  { k: 'yontem', t: 'Nasıl?', s: 'Yöntem' },
  { k: 'arac', t: 'Neyle?', s: 'Roket ve fırlatma' },
  { k: 'brifing', t: 'Brifing', s: 'Sonuç' },
];
export const DEFAULT_TARGET = '99942';                                        // Apophis
export const TARGETS = QUICK_TARGETS;
const YEAR = 365.25 * 86400;

// yöntemler: kısa ad, bir cümle; varsayılan araç değerleri panelin varsayılanlarıyla aynı (index.html: DART benzeri çarpıcı, 1 N × 1 yıl, 20 t traktör 2 yarıçapta)
export const METHODS = {
  kinetic: { t: 'Kinetik çarpıcı', s: 'Uzay aracı asteroide hızla çarpar (DART, 2022). İtki bir anda verilir; roketin taşıdığı kütle ve çarpma hızı belirler.' },
  thrust: { t: 'Sürekli itki', s: 'İyon motoru ya da iyon ışını asteroidi aylarca usulca iter. Önceden uyarı süresi uzun olmalı.' },
  tractor: { t: 'Çekim traktörü', s: 'Araç asteroidin yanında durur, kütle çekimiyle yıllarca çeker; asteroide dokunmaz, parçalamaz.' },
};
export const METHOD_ORDER = ['kinetic', 'thrust', 'tractor'];
export const METHOD_DEFAULTS = { m: 580, U: 6.1, beta: 3.6, F: 1, days: 365, gm: 20000, gk: 2 };

// yöntemin asteroide verdiği hız değişimi (mm/s), varsayılan araçla. M: asteroit kütlesi (kg), R: yarıçap (m)
//   kinetik: Δv = β·m·U / (M + m); sürekli itki: Δv = F·t / M; çekim traktörü: Δv = G·m / d² · t (d = k·R; asteroidin kütlesinden bağımsız)
export function methodDv(k, M, R, o = {}) {
  const q = { ...METHOD_DEFAULTS, ...o };
  if (!(M > 0)) return NaN;
  if (k === 'kinetic') return q.beta * q.m * q.U * 1000 / (M + q.m) * 1000;
  if (k === 'thrust') return q.F * q.days * 86400 / M * 1000;
  if (k === 'tractor') { const d = q.gk * R; return d > 0 ? G_SI * q.gm / (d * d) * q.days * 86400 * 1000 : NaN; }
  return NaN;
}

// yakın geçişin özeti: uzaklık (km, Dünya yarıçapı, Ay uzaklığı), göreli hız, yakalama yarıçapı, kalan süre (nowEt: tarama başlangıcı)
export function caFacts(ca, nowEt) {
  const bp = ca.bp || {};
  return { km: ca.dist, re: ca.dist / R_E, ld: ca.dist / LD, vinf: bp.vinf ?? ca.vrel, bE: bp.bE ?? null, impact: !!bp.impact, years: (ca.et - nowEt) / YEAR, rp: bp.rp ?? null };
}
// önerilen yakın geçiş: çarpıcının fırlatılıp ulaşabileceği kadar uzaktaki (en az minYears) en yakın geçiş; yoksa en yakını
export function recommendCa(cas, nowEt, minYears = 1) {
  if (!cas || !cas.length) return -1;
  const best = (ix) => ix.reduce((b, k) => (b < 0 || cas[k].dist < cas[b].dist ? k : b), -1);
  const ok = cas.map((c, k) => k).filter((k) => (cas[k].et - nowEt) / YEAR >= minYears);
  return ok.length ? best(ok) : best(cas.map((c, k) => k));
}
// bugün uçan roket mi (rockets.js status "Etkin…"): öneri yalnız bunlardan; tarihî roketler (Saturn V) karşılaştırma için listede kalır
export const activeRocket = (id) => !!ROCKETS[id] && /^Etkin/.test(ROCKETS[id].status || '');
// önerilen roket: bugün uçanlar arasında en büyük kayma (bests: { roket: { shift } | null }); hiçbiri ulaşamıyorsa null
export function recommendRocket(bests, ok = activeRocket) {
  let v = null; for (const [id, b] of Object.entries(bests || {})) if (b && ok(id) && (!v || b.shift > bests[v].shift)) v = id;
  return v;
}
// kinetik çarpıcının gerçek Δv'si (mm/s): bugün uçan roketlerin en iyi önleme çözümü (fırlatma penceresinden); yoksa null
export function kineticBest(bests) { const id = recommendRocket(bests); return id ? { id, b: bests[id], dv: bests[id].dvMps * 1000 } : null; }
// önerilen yöntem: en büyük Δv (kinetik: gerçek roketle bulunduysa onun; eşitlikte kinetik: tek seferlik, en olgun teknoloji)
export function recommendMethod(M, R, kinDv = null) {
  const dv = (k) => (k === 'kinetic' && kinDv != null ? kinDv : methodDv(k, M, R));
  return METHOD_ORDER.reduce((b, k) => (dv(k) > dv(b) * 1.0001 ? k : b), 'kinetic');
}

// LS19 önerisi: { v, why } (why çevrilir; sayılar hazır biçimli)
export function recommendDf(step, sel, ctx = {}) {
  switch (step) {
    case 'hedef': return { v: DEFAULT_TARGET, why: 'Apophis: 13 Nisan 2029\'da Dünya\'nın yanından, yer eşzamanlı uydulardan daha yakından geçecek. Yakın geçiş yakında: saptırmanın neye bağlı olduğu en iyi onda görülür.' };
    case 'gecis': {
      const k = recommendCa(ctx.cas, ctx.nowEt); if (k < 0) return null;
      const f = caFacts(ctx.cas[k], ctx.nowEt);
      return { v: k, why: f.years >= 1 ? 'En yakın geçiş ve çarpıcıyı fırlatmaya yetecek zaman: {0}, {1} sonra.' : 'En yakın geçiş: {0}, {1} sonra. Zaman az: çarpıcı hemen fırlatılmalı.', a: [kmText(f.km), leadText(f.years * 365.25)] };
    }
    case 'yontem': {
      if (!(ctx.M > 0)) return null;
      if (ctx.kinPending) return { v: null, why: 'Kinetik çarpıcının gerçek kütlesi ve çarpma hızı fırlatma penceresinden gelir: LS19 bugün uçan roketlerle önleme yörüngelerini hesaplıyor…' };
      const K = kineticBest(ctx.bests), v = recommendMethod(ctx.M, ctx.R, K ? K.dv : null), dv = v === 'kinetic' && K ? K.dv : methodDv(v, ctx.M, ctx.R);
      if (v === 'kinetic') return K ? { v, why: 'Kinetik çarpıcı: {1} ile en büyük hız değişimi ({0} mm/s) ve DART\'la denenmiş tek yöntem.', a: [sig(dv, 3), ROCKETS[K.id].name] }
        : { v, why: 'Kinetik çarpıcı: varsayılan araçlarla en büyük hız değişimi ({0} mm/s) ve DART\'la denenmiş tek yöntem.', a: [sig(dv, 3)] };
      return { v, why: K ? 'Bu asteroitte {1}, bugünkü roketlerle kinetik çarpıcıdan büyük hız değişimi verir ({0} mm/s).' : 'Bu asteroitte {1}, kinetik çarpıcıdan büyük hız değişimi verir ({0} mm/s).', a: [sig(dv, 3), METHODS[v].t] };
    }
    case 'arac': {
      if (sel.method !== 'kinetic') return null;
      const v = recommendRocket(ctx.bests); if (!v) return null;
      return { v, why: '{0}: bugün uçan roketler arasında bu geçiş için en büyük kayma ({1}). Roket ne kadar ağır bir çarpıcıyı hızla gönderirse kayma o kadar büyük.', a: [ctx.rocketName ? ctx.rocketName(v) : v, kmText(ctx.bests[v].shift)] };
    }
    default: return null;
  }
}

// seçimin gerekçesi, sayılarla: [{ t, a }] (a: { n, d } sayı ya da hazır metin)
export function reasonsDf(step, sel, ctx = {}) {
  const out = [];
  if (step === 'hedef') {
    const d = ctx.det; if (!d) return out;
    if (d.D > 0) out.push({ t: 'Çap: {0}{1}.', a: [sizeText(d.D), d.Dmeas ? '' : ' (parlaklığından tahmin)'] });
    if (ctx.M > 0) out.push({ t: 'Kütle ≈ {0} kg: itilecek olan bu.', a: [sig(ctx.M, 2)] });
    if (d.moid != null) out.push({ t: 'Yörüngesi Dünya\'nın yörüngesine en çok {0} yaklaşır (MOID).', a: [kmText(d.moid * 149597870.7)] });
    if (d.sentry) out.push({ t: 'JPL Sentry listesinde: çarpma olasılığı {0}.', a: [sig(d.sentry.ip, 2)] });
    if (d.moid > 0.05) out.push({ t: 'Dünya\'ya 0,05 AB\'den fazla yaklaşmıyor: yakın geçiş bulunamayabilir.', a: [] });
  } else if (step === 'gecis') {
    const ca = ctx.cas && ctx.cas[sel.ca]; if (!ca) return out;
    const f = caFacts(ca, ctx.nowEt);
    out.push({ t: 'Uzaklık {0}: Dünya yarıçapının {1} katı, Ay uzaklığının {2} katı.', a: [kmText(f.km), { n: f.re, d: f.re < 10 ? 1 : 0 }, { n: f.ld, d: 2 }] });
    if (f.vinf != null) out.push({ t: 'Dünya\'ya göre hızı {0} km/s.', a: [{ n: f.vinf, d: 1 }] });
    out.push({ t: 'Kalan süre {0}: çarpıcı bu sürede fırlatılıp asteroide ulaşmalı.', a: [leadText(Math.max(0, f.years * 365.25))] });
    if (f.bE) out.push({ t: 'Yakalama yarıçapı {0}: Dünya\'nın çekimi yakından geçeni kendine çeker. Çarpacak olsaydı geçiş noktası en az bu kadar kaymalı.', a: [kmText(f.bE)] });
    if (!f.impact && sel.hypo) out.push({ t: 'Gerçek yörüngede çarpmıyor. Deney "çarpacak olsaydı" diye sorar: aynı geçiş Dünya\'nın merkezine doğru olsaydı bu itki kurtarır mıydı?', a: [] });
    if (!f.impact && !sel.hypo) out.push({ t: 'Gerçek yörünge: itki geçiş uzaklığını değiştirir; sonuç, sonraki geçişlerde bir anahtar deliğine düşüp düşmediğini de gösterir.', a: [] });
  } else if (step === 'yontem') {
    if (!(ctx.M > 0)) return out;
    const K = kineticBest(ctx.bests), dv = (k) => sig(k === 'kinetic' && K ? K.dv : methodDv(k, ctx.M, ctx.R), 3);
    out.push({ t: 'Hız değişimi: kinetik çarpıcı {0} mm/s, sürekli itki {1} mm/s, çekim traktörü {2} mm/s.', a: [dv('kinetic'), dv('thrust'), dv('tractor')] });
    if (sel.method === 'kinetic') out.push(K ? { t: 'Çarpıcı: {0} ile {1} kg, çarpma hızı {2} km/s, β {3} (fırlatma penceresinin en iyi çözümü).', a: [ROCKETS[K.id].name, { n: K.b.m, d: 0 }, { n: K.b.U, d: 1 }, { n: METHOD_DEFAULTS.beta, d: 1 }] }
      : { t: 'Çarpıcı: {0} kg, {1} km/s, β {2} (DART benzeri). Sonraki adımda roket gerçek kütleyi ve hızı verir.', a: [{ n: METHOD_DEFAULTS.m, d: 0 }, { n: METHOD_DEFAULTS.U, d: 1 }, { n: METHOD_DEFAULTS.beta, d: 1 }] });
    else if (sel.method === 'thrust') out.push({ t: 'Sürekli itki: {0} N, {1} gün. Hız değişimi itkiyle ve süreyle doğrusal büyür.', a: [{ n: METHOD_DEFAULTS.F, d: 0 }, { n: METHOD_DEFAULTS.days, d: 0 }] });
    else if (sel.method === 'tractor') out.push({ t: 'Çekim traktörü: {0} kg araç, {1} yarıçap uzakta, {2} gün. Asteroidin kütlesinden bağımsız; küçük asteroitlerde etkili.', a: [{ n: METHOD_DEFAULTS.gm, d: 0 }, { n: METHOD_DEFAULTS.gk, d: 1 }, { n: METHOD_DEFAULTS.days, d: 0 }] });
    out.push({ t: 'Aynı hız değişimi ne kadar erken verilirse geçiş noktası o kadar kayar: yörüngede biriken zamanlama farkı.', a: [] });
  } else if (step === 'arac') {
    const b = ctx.bests && ctx.bests[sel.rocket]; if (!b) return out;
    out.push({ t: 'Fırlatma {0}, {1} gün uçuş, çarpma {2}.', a: [ctx.date(b.etL), { n: b.tofDays, d: 0 }, ctx.date(b.etA)] });
    out.push({ t: 'Çarpıcı {0} kg, çarpma hızı {1} km/s, kalkış enerjisi C3 {2} km²/s².', a: [{ n: b.m, d: 0 }, { n: b.U, d: 1 }, { n: b.C3, d: 1 }] });
    out.push({ t: 'Hız değişimi {0} mm/s: geçiş noktası {1} kayar (yakalama yarıçapının %{2}\'i).', a: [sig(b.dvMps * 1000, 3), kmText(b.shift), { n: 100 * b.shift / ctx.bE, d: b.shift < 0.1 * ctx.bE ? 1 : 0 }] });
    if (!activeRocket(sel.rocket)) out.push({ t: '{0} bugün uçmuyor ({1}): karşılaştırma için listede.', a: [ROCKETS[sel.rocket].name, ROCKETS[sel.rocket].status] });
  }
  return out;
}

// brifing çizelgesi: fırlatma → çarpma (kinetik) ya da itki başlangıcı → yakın geçiş; dt fırlatmadan (ya da itkiden) beri saniye
export function dfTimeline(o) {
  const rows = [];
  if (o.etL != null) rows.push({ k: 'Fırlatma', t: o.etL });
  if (o.etA != null) rows.push({ k: o.kinetic ? 'Çarpma' : 'İtki başlar', t: o.etA });
  if (o.etEnd != null) rows.push({ k: 'İtki biter', t: o.etEnd });
  if (o.caEt != null) rows.push({ k: 'Yakın geçiş', t: o.caEt });
  const t0 = rows.length ? rows[0].t : 0;
  return rows.map((r) => ({ ...r, dt: r.t - t0 }));
}
// "1 yıl 3 ay" biçimli süre (gün)
export const spanText = (days) => leadText(days);
export const pct = (x) => fmt(100 * x, x < 0.1 ? 1 : 0);
