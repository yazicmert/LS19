// Asteroit saptırma brifingi sınaması (Node): cd web && node test/test_brifsaptirma.js
//  1) brifsaptirmatext.js saf mantığı: adımlar, yöntemlerin hız değişimi (fizik), yakın geçiş ve roket önerisi (yalnız bugün uçan roketler),
//     yöntem önerisi (kinetik: gerçek roketin önleme çözümüyle), gerekçeler sayılarla, çizelge
//  2) arayüz sözleşmesi: ortak brifing kabuğunun alt sınıfı; hesap deneyin kendi motorunda (DeflectUI olayları, iş parçacığı); app.js kaydı
import fs from 'fs';
import * as T from '../js/brifsaptirmatext.js';
import { G_SI } from '../js/deflect.js';

let fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}`); if (!ok) fail++; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const YEAR = 365.25 * 86400;

// ---------------------------------------------------------------- 1) saf mantık
check('beş adım: Hangi asteroit? → Ne zaman? → Nasıl? → Neyle? → Brifing', T.DF_STEPS.map((s) => s.k).join() === 'hedef,gecis,yontem,arac,brifing');
check('hızlı hedefler panelinkilerle aynı (Apophis, Bennu, Didymos, 2024 YR4); varsayılan Apophis', T.TARGETS.map((q) => q.name).join() === 'Apophis,Bennu,Didymos,2024 YR4' && T.DEFAULT_TARGET === '99942');
{
  const M = 4e10, R = 170, d = T.METHOD_DEFAULTS;
  const kin = T.methodDv('kinetic', M, R), thr = T.methodDv('thrust', M, R), gt = T.methodDv('tractor', M, R);
  check('kinetik: Δv = β·m·U / (M + m) (DART benzeri 580 kg, 6,1 km/s, β 3,6 → Apophis\'te ~0,32 mm/s)', near(kin, d.beta * d.m * d.U * 1e6 / (M + d.m)) && Math.abs(kin - 0.318) < 0.002);
  check('sürekli itki: Δv = F·t / M (1 N × 1 yıl)', near(thr, d.F * d.days * 86400 / M * 1000));
  check('çekim traktörü: Δv = G·m/d²·t, asteroidin kütlesinden bağımsız (d = 2 yarıçap)', near(gt, G_SI * d.gm / (2 * R) ** 2 * d.days * 86400 * 1000) && near(T.methodDv('tractor', 10 * M, R), gt));
  check('kütle yoksa hız değişimi yok (NaN)', Number.isNaN(T.methodDv('kinetic', 0, R)));
  check('yöntem önerisi: varsayılanlarla en büyük Δv; gerçek roketin kinetik Δv\'si verilince o kullanılır', T.recommendMethod(M, R) === 'thrust' && T.recommendMethod(M, R, 9.8) === 'kinetic');
}
{
  const now = 0, ca = (y, km, impact = false) => ({ et: now + y * YEAR, dist: km, vrel: 6, bp: { vinf: 5.8, bE: 13773, impact } });
  const cas = [ca(0.4, 20000), ca(2.4, 38011), ca(24.4, 6.2e6)];
  check('yakın geçiş önerisi: çarpıcı fırlatmaya yetecek zamanı (≥ 1 yıl) olan en yakın geçiş; hiçbiri yoksa en yakını', T.recommendCa(cas, now) === 1 && T.recommendCa([ca(0.2, 9e4), ca(0.5, 5e4)], now) === 1 && T.recommendCa([], now) === -1);
  const f = T.caFacts(cas[1], now);
  check('geçiş özeti: km, Dünya yarıçapı, Ay uzaklığı, göreli hız, yakalama yarıçapı, kalan yıl', near(f.km, 38011) && Math.abs(f.re - 5.96) < 0.01 && Math.abs(f.ld - 0.0989) < 0.001 && f.vinf === 5.8 && f.bE === 13773 && near(f.years, 2.4) && !f.impact);
  const rs = T.reasonsDf('gecis', { ca: 1, hypo: true }, { cas, nowEt: now }).map((q) => q.t).join(' | ');
  check('geçiş gerekçeleri: uzaklık, hız, kalan süre, yakalama yarıçapı; çarpmayan geçişte "çarpacak olsaydı" açıklaması', /Uzaklık \{0\}/.test(rs) && /Kalan süre/.test(rs) && /Yakalama yarıçapı/.test(rs) && /çarpacak olsaydı/.test(rs));
  const r = T.recommendDf('gecis', {}, { cas, nowEt: now });
  check('LS19 önerisi (geçiş): seçilen indis ve sayılar (km, kalan süre)', r.v === 1 && r.a[0] === '38.011 km' && /yıl/.test(r.a[1]));
}
{
  const b = (shift, m = 3000) => ({ shift, m, U: 12.9, C3: 20, tofDays: 112, etL: 0, etA: 86400 * 112, dvMps: 0.004 });
  const bests = { SATURN_V: b(1325), SLS1: b(572), F9: b(63.6), FH: b(112), VULCAN: b(119), GENEL: null };
  check('roket önerisi yalnız bugün uçanlardan: Saturn V (tarihî) en büyük kaymayı verse de SLS önerilir', T.recommendRocket(bests) === 'SLS1' && T.activeRocket('SLS1') && !T.activeRocket('SATURN_V') && !T.activeRocket('GENEL'));
  check('yalnız tarihî roket ulaşabiliyorsa öneri yok (kullanıcı seçebilir)', T.recommendRocket({ SATURN_V: b(10), FH: null }) === null);
  check('kinetik en iyi: bugün uçan roketin önleme çözümü (mm/s)', T.kineticBest(bests).id === 'SLS1' && near(T.kineticBest(bests).dv, 4) && T.kineticBest({}) === null);
  const ctx = { bests, bE: 13773, date: () => 'D', rocketName: (id) => id };
  const ar = T.reasonsDf('arac', { rocket: 'SATURN_V' }, ctx).map((q) => q.t).join(' | ');
  check('roket gerekçeleri: fırlatma, uçuş, çarpma; kütle, hız, C3; kayma yakalama yarıçapına oranla; tarihî roket notu', /Fırlatma \{0\}/.test(ar) && /C3/.test(ar) && /yakalama yarıçapının/.test(ar) && /bugün uçmuyor/.test(ar));
  check('yöntem önerisi fırlatma penceresi hesaplanırken bekler (gerçek kütle ve hız gelecek)', T.recommendDf('yontem', {}, { M: 4e10, R: 170, kinPending: true }).v === null && T.recommendDf('yontem', {}, { M: 4e10, R: 170, bests }).v === 'kinetic');
}
{
  const tl = T.dfTimeline({ etL: 100, etA: 200, caEt: 900, kinetic: true }), tn = T.dfTimeline({ etA: 200, etEnd: 500, caEt: 900, kinetic: false });
  check('çizelge: fırlatma → çarpma → yakın geçiş (kinetik); itki başlar → biter → yakın geçiş (öteki yöntemler); süre ilk olaydan',
    tl.map((q) => q.k).join() === 'Fırlatma,Çarpma,Yakın geçiş' && tl[2].dt === 800 && tn.map((q) => q.k).join() === 'İtki başlar,İtki biter,Yakın geçiş' && tn[0].dt === 0);
}

// ---------------------------------------------------------------- 2) arayüz sözleşmesi
const br = read('js/brifsaptirma.js'), dui = read('js/deflectui.js'), work = read('js/deflectwork.js'), app = read('js/app.js'), html = read('index.html'), css = read('css/brifing.css');
check('ortak brifing kabuğunun alt sınıfı (kart, öneri, gerekçe, işaretler, kamera kabuktan)', /export class DeflectBrief extends BriefShell/.test(br) && /super\(host, \{ id: 'saptirma'/.test(br) && !/setViewOffset/.test(br));
check('hesap deneyin kendi motorunda: hedef, tarama, geçiş yolu, fırlatma penceresi ve saptırma DeflectUI üzerinden (panel aynı durumu gösterir)',
  /this\.dui\.setTarget\(i\)/.test(br) && /D\.selectCa\(k\)/.test(br) && /D\.requestPath\(\)/.test(br) && /D\.intercepts\(this\.h\.rockets\(\)/.test(br) && /D\.useIntercept\(b, this\.sel\.rocket\)/.test(br) && /D\.compute\(\)/.test(br));
check('DeflectUI olayları: katalog, hedef, tarama, yol, önleme, saptırma, hata, ilerleme',
  ['catalog', 'target', 'scan', 'path', 'intercepts', 'deflect', 'error', 'progress'].every((k) => new RegExp(`this\\.emit\\('${k}'`).test(dui)) && /this\.hook = null;/.test(dui));
check('iş parçacığı: seçili geçişin nominal yolu (tam tümleme) ve tüm roketler için tek örgüden önleme çözümleri', /d\.cmd === 'path'/.test(work) && /geoPath\(etA, stateAt\(etA\)/.test(work) && /caps: p\.rockets\.map/.test(work) && /bests: pc\.bests/.test(work));
check('fırlatma penceresi geçiş seçilince arka planda başlar; yöntemden bağımsız (yöntem değişince korunur)', /this\.ensureIc\(\); return; \}/.test(br) && /fırlatma penceresi yöntemden bağımsız: korunur/.test(br));
check('app.js: saptırma brifingi gökyüzü motoru kurulunca yapılır (deney merkezinden seçilince); roketler: başarımı yayımlanmış olanlar',
  /saptirma: \(\) => deflect && new DeflectBrief\(/.test(app) && /rockets: \(\) => ROCKET_IDS\.filter\(\(id\) => tliCapacity\(id\) > 0\)/.test(app) && /const briefFor = \(exp\) =>/.test(app));
check('sahne: Güneş sistemi (hedefler işaretli, dokununca seçilir) → Dünya yakını (yol, yer eşzamanlı kuşak, Ay) → asteroidin yakın planı → rampa → sonuç yolları',
  /c\.targets && A\.n > 0/.test(br) && /pick: on \? null : \(\) => this\.pickTarget\(q\.des\)/.test(br) && /GEO_R = 42164/.test(br) && /kind: 'ast', fn: \(tt\) => A\.selPos\(tt\)/.test(br) && /this\.placePin\('pad'/.test(br) && /D\.paths = \{ N: res\.pathN, D: res\.pathD \}/.test(br));
check('modül ön yüklemesi ve stil', /modulepreload" href="js\/brifsaptirma\.js"/.test(html) && /modulepreload" href="js\/brifsaptirmatext\.js"/.test(html) && /\.brief-verdict\.good/.test(css) && /\.brief-search input/.test(css));
check('işaret adı ekrana sığmıyorsa öbür yana geçer (kabuk; telefonda kenar işaretleri kesilmez)', /const bw = b\.offsetWidth \+ 24, left = o\.left \? px > bw : px \+ bw > r\.width;/.test(read('js/brifkabuk.js')));

console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
