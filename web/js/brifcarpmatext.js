// Çarpma riski brifinginin saf mantığı (DOM yok; Node'da sınanır: test/test_briflagrange.js › Çarpma riski). Arayüz: brifcarpma.js.
// Akış: 1 Ne düşebilir? (uydular ya da asteroitler) → 2 Hangisi? (LS19 en yakın yeniden girişi ya da en olası çarpıcıyı seçer) → 3 Brifing.
// Sayılar deneyin kendi hesabından: yörünge bozunması (impact.js, CelesTrak GP + MSIS) ve JPL Sentry sanal çarpıcıları.
import { fmt } from './format.js';
import { fmtOdds, fmtSpan, fmtDate, CONF_TR } from './impact.js';

export const CP_STEPS = [
  { k: 'tur', t: 'Ne düşebilir?', s: 'Tür' },
  { k: 'cisim', t: 'Hangisi?', s: 'Cisim' },
  { k: 'brifing', t: 'Brifing', s: 'Sonuç' },
];
export const CP_TYPES = {
  sat: { t: 'Uydular ve roket gövdeleri', s: 'Yörüngesi alçalan cisimler atmosfere girer: çoğu yanar, büyük parçaların bir kısmı yere ulaşabilir. Tahmin yörünge bozunmasından.' },
  ast: { t: 'Asteroitler', s: 'JPL Sentry: yörünge belirsizliği yüzünden çok küçük de olsa çarpma olasılığı olan asteroitler.' },
};
export const CP_ORDER = ['sat', 'ast'];
const MT = 4.184e15, V_ESC = 11.19;                              // Dünya'dan kaçış hızı (km/s): çarpma hızı² = v∞² + v_kaçış²

// çarpma enerjisi (megaton TNT): E = ½·m·v², m = π/6·D³·ρ (ρ varsayılan 2.000 kg/m³), v² = v∞² + 11,19² km²/s²
export function impactMt(Dkm, vinf, rho = 2000) {
  if (!(Dkm > 0) || !(vinf >= 0)) return null;
  const m = Math.PI / 6 * (Dkm * 1000) ** 3 * rho, v = Math.sqrt(vinf * vinf + V_ESC * V_ESC) * 1000;
  return 0.5 * m * v * v / MT;
}
export const mtText = (mt) => (mt == null ? '—' : mt >= 1 ? `${fmt(mt, mt < 10 ? 1 : 0)} Mt` : `${fmt(mt * 1000, mt * 1000 < 10 ? 1 : 0)} kt`);

// önerilen uydu: güveni yüksek (ya da orta) en yakın yeniden giriş; yoksa listedeki ilk (liste yeniden giriş sırasında)
export function recommendSat(list) {
  if (!list || !list.length) return null;
  return (list.find((x) => x.r.conf === 'high') || list.find((x) => x.r.conf === 'mid') || list[0]).id;
}
// önerilen asteroit: en yüksek çarpma olasılığı
export function recommendAst(list) { return list && list.length ? list.reduce((b, d) => (d.ip > b.ip ? d : b)).des : null; }

export function recommendCp(step, sel, ctx = {}) {
  if (step === 'tur') {
    const S = ctx.sats;
    return S ? { v: 'sat', why: 'Uydular: yeniden girişler gerçek ve sık. Bu hesapla kontrolsüz olabilecek {0} cisim bir yıl içinde atmosfere girer.', a: [{ n: S.n1, d: 0 }] }
      : { v: 'sat', why: 'Uydular: yeniden girişler gerçek ve sık; asteroit çarpma olasılıkları ise çok küçüktür.' };
  }
  if (step === 'cisim') {
    if (sel.type === 'ast') { const v = recommendAst(ctx.asts && ctx.asts.list); if (!v) return null; const d = ctx.asts.list.find((q) => q.des === v); return { v, why: '{0}: Sentry\'de çarpma olasılığı en yüksek asteroit ({1}).', a: [ctx.label(v), fmtOdds(d.ip)] }; }
    const L = ctx.sats && ctx.sats.list, v = recommendSat(L); if (!v) return null;
    const x = L.find((q) => q.id === v);
    return { v, why: '{0}: güveni {1} en yakın yeniden giriş ({2}).', a: [x.o.OBJECT_NAME, CONF_TR[x.r.conf] || CONF_TR.low, fmtDate(x.r.reentryMs)] };
  }
  return null;
}

export function reasonsCp(step, sel, ctx = {}) {
  const out = [], now = ctx.now || Date.now();
  if (step === 'tur') {
    if (sel.type === 'sat' && ctx.sats) {
      out.push({ t: 'Kontrolsüz olabilecek {0} cisim (≥ 10 yıllık, son ~14 ayda yörüngesini korumamış): {1} tanesi 1 yıl, {2} tanesi 5 yıl içinde atmosfere girer.', a: [{ n: ctx.sats.live, d: 0 }, { n: ctx.sats.n1, d: 0 }, { n: ctx.sats.n5, d: 0 }] });
      out.push({ t: 'Yeniden giriş 120 km perijede sayılır. Güneş etkinliği değişeceği için uzun süreli tahminlerde belirsizlik 2–5 kattır.', a: [] });
    } else if (sel.type === 'ast' && ctx.asts) {
      const R = ctx.asts.all, hi = R.filter((d) => d.ip >= 1e-3).length, t1 = R.filter((d) => +d.ts >= 1).length;
      out.push({ t: 'Sentry\'de {0} asteroit için sıfır olmayan çarpma olasılığı var; 1/1000\'den büyük olan {1}, Torino ≥ 1 olan {2}.', a: [{ n: R.length, d: 0 }, { n: hi, d: 0 }, { n: t1, d: 0 }] });
      out.push({ t: 'Kesin çarpacağı bilinen asteroit yok: bunlar yörünge belirsizliğinden doğan olasılıklar; gözlem arttıkça çoğu sıfıra iner.', a: [] });
    }
  } else if (step === 'cisim') {
    if (sel.type === 'sat') {
      const x = ctx.sats && ctx.sats.list.find((q) => q.id === sel.id); if (!x) return out;
      const r = x.r, rem = (r.reentryMs - now) / 864e5;
      out.push({ t: 'Yörünge {0} × {1} km: sürtünme perijede en büyük.', a: [{ n: r.perigeeKm, d: 0 }, { n: r.apogeeKm, d: 0 }] });
      out.push({ t: 'Tahmini yeniden giriş {0}, {1} sonra (güven: {2}).', a: [fmtDate(r.reentryMs), fmtSpan(rem), CONF_TR[r.conf] || CONF_TR.low] });
      if (r.method === 'hist') out.push({ t: 'Sürüklenme gözlenen alçalmadan (CelesTrak geçmişi) ölçüldü: yalnız B*\'tan daha güvenilir.', a: [] });
      else if (r.method === 'bstar') out.push({ t: 'Sürüklenme GP kaydındaki B* teriminden.', a: [] });
    } else {
      const d = ctx.asts && ctx.asts.list.find((q) => q.des === sel.id); if (!d) return out;
      out.push({ t: 'Olası çarpma yılı {0}; toplam olasılık {1}.', a: [d.y0 === d.y1 ? String(d.y0) : `${d.y0}–${d.y1}`, fmtOdds(d.ip)] });
      if (d.D) out.push({ t: 'Çap ≈ {0}; Dünya\'ya varış hızı {1} km/s.', a: [d.D >= 1 ? `${fmt(d.D, 2)} km` : `${Math.round(d.D * 1000)} m`, { n: +d.vinf, d: 1 }] });
      const mt = impactMt(d.D, +d.vinf); if (mt != null) out.push({ t: 'Çarpsaydı açığa çıkacak enerji ≈ {0} TNT (yoğunluk 2.000 kg/m³ varsayımıyla).', a: [mtText(mt)] });
      out.push(d.ps < 0 ? { t: 'Palermo ölçeği {0}: sıfırın altı, aynı büyüklükteki rastgele bir cismin arka plan riskinden küçük demek.', a: [{ n: d.ps, d: 2 }] }
        : { t: 'Palermo ölçeği {0}: arka plan riskine eşit ya da büyük; yakından izlenir.', a: [{ n: d.ps, d: 2 }] });
    }
  }
  return out;
}
