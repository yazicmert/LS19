// Lagrange noktaları ve Çarpma riski brifingleri sınaması (Node): cd web && node test/test_briflagrange.js
//  1) briflagrangetext.js: adımlar, nokta özetleri (Dünya–Ay, Güneş–Dünya), çıkış süresi kuramı ve tümlemeyle karşılaştırma, öneriler, gerekçeler, olgular
//  2) brifcarpmatext.js: adımlar, çarpma enerjisi, uydu ve asteroit önerisi, gerekçeler
//  3) arayüz sözleşmesi: ortak kabuğun alt sınıfları; deneylerin kendi hesabı (LagrangeUI.applyBrief, ImpactUI olayları); app.js kaydı; 3B sahne
import fs from 'fs';
import * as L from '../js/briflagrangetext.js';
import * as C from '../js/brifcarpmatext.js';
import * as G from '../js/lagrange.js';

let fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}`); if (!ok) fail++; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// ---------------------------------------------------------------- 1) Lagrange
check('Lagrange: dört adım (sistem → nokta → hata → brifing); iki gerçek sistem', L.LG_STEPS.map((s) => s.k).join() === 'sistem,nokta,deney,brifing' && L.LG_ORDER.join() === 'em,se');
{
  const em = G.systemOf('em'), se = G.systemOf('se'), P = L.pointsOf(em), Q = L.pointsOf(se);
  const nearEm = G.nearRadius(G.points(em.mu), em.mu) * em.L_km;
  check('Dünya–Ay: L1 Ay\'a ~58.000 km, e-katlanma ~1,5 gün; L4/L5 kararlı (salınım ~92 gün)', Math.abs(P[0].d2Km - 58072) < 50 && Math.abs(P[0].efoldDays - 1.48) < 0.02 && P[3].efoldDays == null && Math.abs(Math.max(...P[3].oscDays) - 91.6) < 0.5);
  check('Güneş–Dünya: L2 Dünya\'ya ~1,5 milyon km, e-katlanma ~23 gün', Math.abs(Q[1].d2Km - 1.5077e6) < 5e3 && Math.abs(Q[1].efoldDays - 23.4) < 0.2);
  const lv = L.leaveDays(P[0], nearEm, 10), run = G.runFrom(em, 'L1', { dr: [10, 0, 0], days: 30 });
  check('çıkış süresi kuramı (τ·ln(yakın / hata)) tümlemeyle uyumlu: L1, 10 km → ~11,8 gün (tümleme ~12,2)', Math.abs(lv - 11.8) < 0.2 && Math.abs(run.tLeave - lv) / lv < 0.06);
  check('hatayı 10 kat küçültmek yalnız τ·ln10 gün kazandırır', Math.abs(L.leaveDays(P[0], nearEm, 1) - lv - P[0].efoldDays * Math.log(10)) < 1e-9 && L.leaveDays(P[3], nearEm, 10) === null);
  check('izleme süresi önerisi: çıkışın en az 1,5 katı (L1 → 30 gün); kararlıda salınım (L4 → 180 gün); Güneş–Dünya L2 → 730 gün',
    L.daysFor('em', P[0], nearEm, 10) === 30 && L.daysFor('em', P[3], nearEm, 10) === 180 && L.daysFor('se', Q[1], G.nearRadius(G.points(se.mu), se.mu) * se.L_km, 10) === 730);
  const ctx = { sys: em, points: P, point: P[0], nearKm: nearEm, run };
  check('LS19 önerileri: Dünya–Ay; en hızlı kararsız nokta (L1); Güneş–Dünya\'da L2 (JWST); 10 km ve uygun süre',
    L.recommendLg('sistem', {}).v === 'em' && L.recommendLg('nokta', { sys: 'em' }, ctx).v === 'L1' && L.recommendLg('nokta', { sys: 'se' }, { points: Q }).v === 'L2' && L.recommendLg('deney', { sys: 'em' }, ctx).v === '10|30');
  const rs = L.reasonsLg('deney', { sys: 'em', point: 'L1', errKm: 10 }, ctx).map((q) => q.t).join(' | ');
  check('deney gerekçeleri: yakın sınırı, kuramın çıkış süresi, tümlemenin sonucu, üstel kararsızlık', /yakını/.test(rs) && /Kurama göre/.test(rs) && /Tümleme: araç/.test(rs) && /10 kat/.test(rs));
  check('olgular: ARTEMIS Lissajous (halo değil), Gaia L2\'de değil (2025\'te ayrıldı), iki Dünya Truvalısı da L4\'te', /Lissajous/.test(L.RESIDENTS.em.L1) && !/Gaia/.test(L.RESIDENTS.se.L2) && /2010 TK7, 2020 XL5/.test(L.RESIDENTS.se.L4) && /bilinen bir Truva asteroidi yok/.test(L.RESIDENTS.se.L5));
}

// ---------------------------------------------------------------- 2) Çarpma riski
check('Çarpma riski: üç adım (tür → cisim → brifing); uydular ve asteroitler', C.CP_STEPS.map((s) => s.k).join() === 'tur,cisim,brifing' && C.CP_ORDER.join() === 'sat,ast');
{
  const mt = C.impactMt(0.007, 5.1), e = 0.5 * Math.PI / 6 * 7 ** 3 * 2000 * ((5.1 ** 2 + 11.19 ** 2) * 1e6) / 4.184e15;
  check('çarpma enerjisi: ½·m·v², v² = v∞² + v_kaçış² (7 m, 5,1 km/s, 2.000 kg/m³ → ~6,5 kt)', Math.abs(mt - e) < 1e-12 && Math.abs(mt * 1000 - 6.49) < 0.01 && C.mtText(mt) === '6,5 kt' && C.mtText(12.3) === '12 Mt' && C.impactMt(null, 5) === null);
  const sat = (id, conf, ms) => ({ id, o: { OBJECT_NAME: 'S' + id }, r: { conf, reentryMs: ms, perigeeKm: 300, apogeeKm: 320 } });
  check('uydu önerisi: güveni yüksek en yakın; yoksa orta; yoksa ilk', C.recommendSat([sat(1, 'low', 1), sat(2, 'mid', 2), sat(3, 'high', 3)]) === 3 && C.recommendSat([sat(1, 'low', 1), sat(2, 'mid', 2)]) === 2 && C.recommendSat([sat(1, 'low', 1)]) === 1 && C.recommendSat([]) === null);
  check('asteroit önerisi: en yüksek çarpma olasılığı', C.recommendAst([{ des: 'a', ip: 1e-5 }, { des: 'b', ip: 0.1 }]) === 'b' && C.recommendAst([]) === null);
  const d = { des: '2010 RF12', ip: 0.1, ps: -2.96, ts: '0', y0: 2095, y1: 2122, D: 0.007, vinf: '5.1' };
  const rs = C.reasonsCp('cisim', { type: 'ast', id: '2010 RF12' }, { asts: { list: [d], all: [d] } }).map((q) => q.t).join(' | ');
  check('asteroit gerekçeleri: yıl ve olasılık, çap ve hız, enerji (varsayımıyla), Palermo (sıfırın altı: arka plandan küçük)', /Olası çarpma yılı/.test(rs) && /varış hızı/.test(rs) && /2\.000 kg\/m³ varsayımıyla/.test(rs) && /arka plan riskinden küçük/.test(rs));
  check('tür gerekçesi: kesin çarpacağı bilinen asteroit yok', /Kesin çarpacağı bilinen asteroit yok/.test(C.reasonsCp('tur', { type: 'ast' }, { asts: { list: [d], all: [d] } }).map((q) => q.t).join()));
}

// ---------------------------------------------------------------- 3) arayüz sözleşmesi
const lg = read('js/briflagrange.js'), cp = read('js/brifcarpma.js'), lui = read('js/lagrangeui.js'), iui = read('js/impactui.js'), app = read('js/app.js'), html = read('index.html');
check('ortak kabuğun alt sınıfları', /export class LagrangeBrief extends BriefShell/.test(lg) && /export class ImpactBrief extends BriefShell/.test(cp) && !/setViewOffset/.test(lg + cp));
check('Lagrange: brifing kapanınca deney panelde aynı seçimlerle (LagrangeUI.applyBrief → Deney adımı, koşulmuş); halo adımına ve Ay görevine (NRHO) geçiş',
  /applyBrief\(\{ sys, point, errKm, days \}\)/.test(lui) && /this\.open\(3\); this\.doRun\(\);/.test(lui) && /this\.h\.lg\.applyBrief\(sel\)/.test(lg) && /this\.h\.lg\.open\(4\)/.test(lg) && /this\.h\.onFly\('NRHO'\)/.test(lg));
check('Lagrange sahnesi: dönen çerçeveden gerçek konuma (Dünya–Ay: Ay\'ın yörünge normali; Güneş–Dünya: ekliptik); noktalar dokununca seçilir; deney yolu çizilir',
  /zz = unit\(E\.cross\(rm, vm\)\)/.test(lg) && /zz = ECL/.test(lg) && /pick = c\.k === 'nokta' && !on \? \(\) => this\.pickPoint\(p\.id\)/.test(lg) && /put\(L\.path, r\.pts\)/.test(lg));
check('Çarpma riski: hesap deneyin kendi motorunda (ImpactUI: olaylar, en yakın yeniden girişler, Sentry sıralaması); panelde aynı cisim açılır',
  /emit\('sats'\)/.test(iui) && /topSats\(n = 6\)/.test(iui) && /topAsts\(n = 6\)/.test(iui) && /this\.iu\.pickSat\(x\)/.test(cp) && /this\.iu\.pickAst\(d\)/.test(cp) && /openLab\(i, \{ hypo: true \}\)/.test(cp));
check('app.js: iki brifing deney merkezinden seçilince yapılır', /lagrange: \(\) => new LagrangeBrief\(/.test(app) && /carpma: \(\) => impactui && new ImpactBrief\(/.test(app) && /satPos: \(id, t\) => S\.tracker\.icrfOf\(id, t\)/.test(app));
check('modül ön yüklemesi', ['briflagrange', 'briflagrangetext', 'brifcarpma', 'brifcarpmatext'].every((m) => html.includes(`modulepreload" href="js/${m}.js"`)));

console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
