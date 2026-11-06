// Arayüz dili (js/i18n.js, js/i18n/en.js) — Node 20+: cd web && node test/test_i18n.js
//  1) Kapsam: tools/i18n_cikar.mjs'in index.html ve js/*.js'ten çıkardığı her Türkçe metnin sözlükte karşılığı var (ya da bilerek "same" listesinde).
//  2) Artık girdi yok: sözlükteki her anahtar kaynakta hâlâ geçiyor (elle eklenenler "manual"da) — yazım hatalı anahtar burada yakalanır.
//  3) Yer tutucular: anahtar ve karşılıkta aynı {n} kümesi.
//  4) Çevirmen: tam eşleşme, uç boşluklar, kalıplar (boş yer tutucu, sıra değişimi, özyineleme), " · "/" — "/cümle/parantez bölme, yüzde,
//     sayı şekli önbelleği, t() doldurma.
//  5) Node'da dil Türkçe: sözlük yüklenmedikçe metinler aynen kalır (öteki testler Türkçe çıktıyı denetler).
import { extractKeys, isTurkish } from '../../tools/i18n_cikar.mjs';
import EN, { manual, same } from '../js/i18n/en.js';
import * as I from '../js/i18n.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const show = (a) => a.slice(0, 8).map((x) => JSON.stringify(x)).join(', ') + (a.length > 8 ? ` … (+${a.length - 8})` : '');

// ---------------------------------------------------------------- 5) Node varsayılanı
check('Node\'da dil Türkçe, yerel ayar tr-TR', I.lang === 'tr' && I.LOC === 'tr-TR' && !I.isEn);
check('sözlüksüz t() metni aynen döndürür', I.t('Görev süresi') === 'Görev süresi' && I.t('{0} gün', 3) === '3 gün');
check('yön harfleri ve pusula Türkçe', I.ns(1) === 'K' && I.ns(-1) === 'G' && I.ew(1) === 'D' && I.ew(-1) === 'B' && I.compass16(0) === 'K' && I.compass16(225) === 'GB' && I.compass16(-22.5) === 'KKB');

// ---------------------------------------------------------------- 1–3) sözlük kapsamı
const byFile = extractKeys();
const keys = new Set(Object.values(byFile).flat());
const keep = new Set(same), man = new Set(Object.keys(manual));
const missing = [...keys].filter((k) => !(k in EN) && !keep.has(k));
check(`her Türkçe metnin İngilizcesi var (${keys.size} metin)`, missing.length === 0, missing.length ? show(missing) + ' — node tools/i18n_cikar.mjs --eksik' : '');
const orphan = Object.keys(EN).filter((k) => !keys.has(k) && !man.has(k));
check('sözlükte artık (kaynakta olmayan) anahtar yok', orphan.length === 0, show(orphan));
const sameIn = [...keep].filter((k) => k in EN);
check('"same" listesindekiler sözlükte değil', sameIn.length === 0, show(sameIn));
const ph = (s) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
const badPh = Object.entries(EN).filter(([k, v]) => ph(k) !== ph(v)).map(([k]) => k);
check('yer tutucular anahtar ve karşılıkta aynı', badPh.length === 0, show(badPh));
const empty = Object.entries(EN).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k);
check('boş karşılık yok', empty.length === 0, show(empty));
const stillTr = Object.entries(EN).filter(([, v]) => /[çğışÇĞŞ]/.test(v.replace(/Açıkmeşe|Ďurech|Öpik|Diyarbakır|Rümker/g, ''))).map(([k]) => k);
check('İngilizce karşılıklarda Türkçe harf kalmadı (özel adlar dışında)', stillTr.length === 0, show(stillTr));
check('Türkçe sezgisi: Türkçe harfsiz sözcükleri de tanır', isTurkish('Periyot') && isTurkish('Motor') && !isTurkish('Falcon 9 Block 5') && !isTurkish('LH2/LOX'));

// ---------------------------------------------------------------- 4) çevirmen
I.useDictionary({
  'Görev süresi': 'Mission time',
  'Kalan {0}': 'Remaining {0}',
  '{0} gün': '{0} days',
  '{0} · {1} ({2} fırlatma{3})': '{0} · {1} ({2} launches{3})',
  ', etkin değil': ', inactive',
  '{0} rampasından {1} fırlatıldı': '{1} launched from pad {0}',
  'İki kademe': 'Two stages',
  '· yörünge kademesi {0} km irtifada ayrılır': '· orbit stage separates at {0} km altitude',
  'Fazlama {0}: kaydırma 13 dk': 'Phasing {0}: shift 13 min',
  'Ay': 'Moon',
  'Varsayılan araç.': 'Default vehicle.',
  'Bu görevde: yük {0} kg.': 'On this mission: payload {0} kg.',
  '(olanaksız)': '(impossible)',
  '{0} (varsayılan)': '{0} (default)',
  'Merlin 1D Vakum': 'Merlin 1D Vacuum',
});
const tt = I.translateText;
check('tam eşleşme, uç boşluklar korunur', tt('Görev süresi') === 'Mission time' && tt('  Görev   süresi \n') === '  Mission time \n');
check('karşılığı olmayan metin aynen kalır', tt('Falcon 9') === 'Falcon 9' && tt('1.234,5 km') === '1.234,5 km' && tt('') === '');
check('kalıp ve özyineleme ("Kalan {0}" + "{0} gün")', tt('Kalan 5 gün') === 'Remaining 5 days', tt('Kalan 5 gün'));
check('boş yer tutucu ("…fırlatma{3})" etkin rampada boş)', tt('KSC · LC-39B (12 fırlatma)') === 'KSC · LC-39B (12 launches)' && tt('KSC · LC-39A (3 fırlatma, etkin değil)') === 'KSC · LC-39A (3 launches, inactive)');
check('yer tutucu sırası değişebilir', tt('LC-39B rampasından Saturn V fırlatıldı') === 'Saturn V launched from pad LC-39B');
check('" · " ile birleşen parçalar ayrı çevrilir', tt('İki kademe · Optimal') === 'Two stages · Optimal');
check('"· parça" anahtarı bölünmüş metinde öneksiz de bulunur', tt('İki kademe · yörünge kademesi 15 km irtifada ayrılır') === 'Two stages · orbit stage separates at 15 km altitude');
check('ardışık cümleler ayrı çevrilir', tt('Varsayılan araç. Bu görevde: yük 3.600 kg.') === 'Default vehicle. On this mission: payload 3.600 kg.', tt('Varsayılan araç. Bu görevde: yük 3.600 kg.'));
check('" — " parçaları ve "baş (parantez)" ayrı çevrilir', tt('KSC (varsayılan) — 28° N') === 'KSC (default) — 28° N' && tt('Falcon 9 (Merlin 1D Vakum)') === 'Falcon 9 (Merlin 1D Vacuum)', tt('Falcon 9 (Merlin 1D Vakum)'));
check('"etiket: değer" ayrı çevrilir', tt('İki kademe: 6.200 kg') === 'Two stages: 6.200 kg', tt('İki kademe: 6.200 kg'));
check('yüzde işareti sona geçer ("%112 (olanaksız)")', tt('%112 (olanaksız)') === '112% (impossible)', tt('%112 (olanaksız)'));
check('sayılar değişince şekil önbelleği doğru kalıbı verir', tt('Kalan 7 gün') === 'Remaining 7 days' && tt('Kalan 12 gün') === 'Remaining 12 days');
check('sabit metninde rakam olan kalıp, önbellekte "yok" kaydı olsa da bulunur', tt('Fazlama 2: kaydırma 14 dk') === 'Fazlama 2: kaydırma 14 dk' && tt('Fazlama 2: kaydırma 13 dk') === 'Phasing 2: shift 13 min');
check('t() çevirip doldurur', I.t('{0} gün', 3) === '3 days' && I.t('Görev süresi') === 'Mission time');
check('büyük/küçük harf duyarlı tam eşleşme ("Ay" ≠ "ay")', tt('Ay') === 'Moon' && tt('ay') === 'ay');
I.useDictionary(null);
check('sözlük kaldırılınca çeviri durur', tt('Görev süresi') === 'Görev süresi' && !I.hasDictionary());

// tüm sözlükle: her anahtar kendi karşılığına çevrilir (kalıp anahtarları dahil; daha uzun bir kalıp araya girmesin)
I.useDictionary(EN);
const self = Object.entries(EN).filter(([k, v]) => !/\{\d+\}/.test(k) && I.translateText(k) !== v).map(([k]) => k);
check('sözlükteki sabit anahtarlar kendi karşılığına çevrilir', self.length === 0, show(self));
const sample = I.translateText('{0} gün'.replace('{0}', '42'));
check('gerçek sözlükle "{0} gün" kalıbı', sample === '42 days', sample);
I.useDictionary(null);

console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
