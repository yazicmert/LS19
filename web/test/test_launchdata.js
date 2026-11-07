// Fırlatma kataloğu: kaynak kayıtlarının küçük biçime çevrilmesi (LL2, RocketLaunch.Live), takvim seçimi, geri sayım ve T-0 kesinliği,
// son fırlatmaların uydu kataloğuyla COSPAR eşleşmesi (js/launchdata.js, js/launchcal.js). Örnek kayıtlar: test/fixtures/ll2_*.json, rll_next.json.
import fs from 'fs';
import { buildCatalog, nextLaunches, countdown, catalogObjects, precRank, PREC, CREDITS, LAUNCH_PERIOD_S } from '../js/launchdata.js';
import { cdText, whenText } from '../js/launchcal.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } else console.log('tamam', m); };
const fx = (f) => JSON.parse(fs.readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8'));

const cat = buildCatalog('ll2', fx('ll2_upcoming.json').results, fx('ll2_previous.json').results, 123);
ok(cat.kod === 'll2' && cat.t === 123 && cat.kaynak === CREDITS.ll2.t && cat.yaklasan.length === 5 && cat.gecmis.length === 3, 'katalog: kaynak, zaman, NET\'siz kayıt atlanır');
ok(LAUNCH_PERIOD_S === 1800 && (3600 / LAUNCH_PERIOD_S) * 2 === 4, '30 dk yenileme: yenileme başına 2 istek, saatte 4 (LL2 sınırı 15)');
ok(PREC.every((p, i) => precRank(p) === i) && precRank('bilinmeyen') === precRank('gun'), 'kesinlik ölçeği; bilinmeyen kesinlik gün sayılır');

// takvim: sıradaki 3 fırlatma; bir saatten uzun süre önce kalkması gerekenler düşer
const now = Date.parse('2026-11-06T22:00:00Z');
const next = nextLaunches(cat, now, 3);
ok(next.map((l) => l.id).join() === 'u-2,u-1,u-4', 'sıradaki 3 fırlatma zaman sırasıyla: ' + next.map((l) => l.id).join());
ok(nextLaunches(cat, Date.parse('2026-11-07T01:30:00Z'), 1)[0].id === 'u-1', 'T-0 geçtikten sonra 1 saat daha listede (T+)');
ok(nextLaunches(cat, Date.parse('2026-11-07T02:00:00Z'), 1)[0].id === 'u-4', '1 saatten sonra listeden düşer');
ok(nextLaunches(null).length === 0, 'veri yoksa boş');

// geri sayım: saniye/dakika kesinliğinde tam, saatte ≈, gün ve kabasında yok
const u = Object.fromEntries(cat.yaklasan.map((l) => [l.id, l]));
const c1 = countdown(u['u-1'], now);
ok(c1.isaret === '−' && c1.s === Math.floor((Date.parse('2026-11-07T00:48:42Z') - now) / 1000) && !c1.yaklasik, 'saniye kesinliği: tam geri sayım');
ok(countdown(u['u-2'], now).yaklasik && countdown(u['u-3'], now) === null && countdown(u['u-5'], now) === null, 'saat kesinliği ≈; ay ve çeyrekte geri sayım yok');
ok(countdown(u['u-1'], Date.parse('2026-11-07T00:50:00Z')).isaret === '+', 'T-0 geçince T+');
ok(cdText(u['u-1'], now) === 'T− 02:48:42', 'geri sayım metni: ' + cdText(u['u-1'], now));
ok(cdText(u['u-4'], now) === 'T− 1g 14:00', 'bir günden uzun: ' + cdText(u['u-4'], now));
ok(cdText(u['u-2'], now) === '≈T− 01:35:00', 'saat kesinliğinde ≈: ' + cdText(u['u-2'], now));
ok(cdText(u['u-3'], now) === null, 'ay kesinliğinde geri sayım metni yok');
ok(/^Kasım 2026$/.test(whenText(u['u-3'], now)) && /^4\. çeyrek 2026$/.test(whenText(u['u-5'], now)), `kaba tarih: "${whenText(u['u-3'], now)}", "${whenText(u['u-5'], now)}"`);
ok(/≈/.test(whenText(u['u-2'], now)) && !/≈/.test(whenText(u['u-1'], now)), 'saat kesinliğinde zamanın önünde ≈');

// son fırlatmalar ↔ uydu kataloğu (OBJECT_ID = COSPAR + parça harfi)
const omm = [{ NORAD_CAT_ID: 1, OBJECT_NAME: 'STARLINK-A', OBJECT_ID: '2026-246A' }, { NORAD_CAT_ID: 3, OBJECT_NAME: 'STARLINK-AB', OBJECT_ID: '2026-246AB' },
  { NORAD_CAT_ID: 2, OBJECT_NAME: 'STARLINK-B', OBJECT_ID: '2026-246B' }, { NORAD_CAT_ID: 4, OBJECT_NAME: 'BASKA', OBJECT_ID: '2026-2460A' },
  { NORAD_CAT_ID: 5, OBJECT_NAME: 'BASKA2', OBJECT_ID: '2026-24A' }];
const m = catalogObjects('2026-246', omm);
ok(m.map((o) => o.parca).join() === '2026-246A,2026-246B,2026-246AB', 'COSPAR eşleşmesi: yalnız o fırlatmanın parçaları, harf sırasıyla (2026-2460, 2026-24 karışmaz)');
ok(catalogObjects(null, omm).length === 0 && catalogObjects('2026-246', null).length === 0, 'kod ya da katalog yoksa boş');
const fixOmm = fx('gp_active.json');
ok(catalogObjects('1998-067', fixOmm).some((o) => o.id === 25544), 'örnek katalogda ISS (1998-067A) bulunur');

// RocketLaunch.Live: sonuç bilgisi yoksa başarısız sayılmaz, tahmini ay kesinliği
const r = buildCatalog('rll', fx('rll_next.json').result, [], 1);
ok(r.kaynak === 'Data by RocketLaunch.Live' && r.yaklasan.every((l) => l.durum === 'tbd') && r.yaklasan.find((l) => l.id === 'rll-6300').kesinlik === 'ay', 'RocketLaunch.Live kayıtları');

// görev yükü ve görevin kendi sayfası (LL2 ayrıntılı kip): yük uçuşları ve araç, yalnız https bağlar, resmî sayfa önde
const gp = Object.fromEntries(cat.gecmis.map((l) => [l.id, l]));
const nvs = (gp['p-4'] || cat.gecmis.find((l) => /IRNSS/.test(l.gorev))).d.yuk;
ok(nvs.length === 2 && nvs[0].ad === 'NVS-03' && nvs[0].op === 'ISRO' && nvs[0].kg === 2250.5 && nvs[0].url === 'https://www.isro.gov.in/NVS03.html' && !nvs[0].wiki && Array.from(nvs[0].aciklama).length === 400 && nvs[1].adet === 3,
  'yük uçuşu: ad, işletmeci, kütle, kendi sitesi (http Vikipedi bağı atlandı), açıklama 400 kod noktasında kırpılır, adet; adsız yük atlanır');
const drg = cat.gecmis.find((l) => /Ornek Gorev/.test(l.gorev)).d.yuk;
ok(drg.length === 1 && drg[0].arac === true && drg[0].tur === 'Cargo Dragon 2' && drg[0].hedef === 'International Space Station', 'araç (spacecraft_stage): Cargo Dragon, hedef ISS');
const sl = cat.gecmis.find((l) => /Starlink/.test(l.gorev)).d;
ok(sl.gorevTur === 'Communications' && sl.site.length === 2 && sl.site[0].resmi === true && sl.site[0].u.startsWith('https://www.spacex.com') && !sl.site.some((x) => x.u.startsWith('http:')), 'görev türü ve kendi sayfası: resmî sayfa önde, http bağ atlanır');

console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
