// Fırlatma veritabanı (data/launchdb.json, tools/firlatma_db.mjs; GCAT — J. McDowell, CC-BY-4.0) ve sorguları (js/launchdb.js):
// bütünlük (sütun uzunlukları, dizinler), bilinen fırlatmalar (Sputnik 1, Vanguard TV3 başarısızlığı, Apollo 11, Starlink 15-18), arama/süzgeç, yıllık sayılar.
import fs from 'fs';
import { row, size, success, filterIdx, perYear, yearSummary, tagIndex, countryOf, countryName, yearOf, COUNTRY } from '../js/launchdb.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } else console.log('tamam', m); };
const db = JSON.parse(fs.readFileSync(new URL('../data/launchdb.json', import.meta.url), 'utf8'));
const n = size(db);

ok(db.meta.lisans === 'CC-BY-4.0' && /McDowell/.test(db.meta.kaynak) && /planet4589/.test(db.meta.url) && db.meta.n === n, 'kaynak ve lisans (CC-BY-4.0, atıf) üst bilgide');
ok(n > 7000 && Object.values(db.c).every((a) => a.length === n), `${n} fırlatma; tüm sütunlar aynı uzunlukta`);
ok(db.c.lv.every((k) => db.lv[k] !== undefined) && db.c.site.every((k) => Array.isArray(db.site[k])) && db.c.ag.every((k) => Array.isArray(db.ag[k])), 'roket, yer ve kuruluş dizinleri geçerli');
ok(db.c.t.every((t, i) => !i || db.c.t[i - 1] <= t), 'zaman sırasında');
ok(db.c.r.every((r) => r === 'S' || r === 'F'), 'sonuç S ya da F');

const T = tagIndex(db);
const sp = row(db, T.get('1957 ALP'));
ok(sp.gorev === 'PS-1' && sp.t === Date.UTC(1957, 9, 4, 19, 28, 34) && sp.ulke === 'SU' && success(db, sp.i) && /Baykonur/.test(sp.yer), 'Sputnik 1: 4 Ekim 1957 19:28:34 UTC, SSCB, Baykonur, başarılı');
ok(row(db, 0).tag === '1957 ALP', 'ilk kayıt Sputnik 1');
const vg = filterIdx(db, { q: 'vanguard', yil: 1957 }).map((i) => row(db, i));
ok(vg.length === 1 && vg[0].sonuc === 'F' && vg[0].ulke === 'US', 'Vanguard TV3 (Aralık 1957): ABD, başarısız');
const ap = filterIdx(db, { q: 'apollo 11' }).map((i) => row(db, i));
ok(ap.some((r) => r.tag === '1969-059' && r.gorev === 'Apollo 11' && r.yuk === 'Apollo CM-107' && r.roket === 'Saturn V' && r.ucus === 'SA-506' && r.yorunge === 'DSO'), 'Apollo 11: 1969-059, Saturn V SA-506, derin uzay; yük adı ayrı');
ok(row(db, filterIdx(db, { q: 'apollo 11' })[0]).gorev === 'Apollo 11', 'aramada ifadenin bütün geçtiği kayıt önde ("apollo 11" -> Apollo 11, CM-111 değil)');
const sl = row(db, T.get('2026-246'));
ok(sl.roket === 'Falcon 9' && sl.gorev === 'Starlink Group 15-18' && sl.yuk === 'Starlink-429' && sl.ucus === 'B1093.18 F701' && sl.ulke === 'US' && sl.kg > 10000, `2026-246: Falcon 9, Starlink 15-18, itici ${sl.ucus}, ${sl.kg} kg`);

// arama: Türkçe büyük/küçük ve aksan duyarsız, sözcüklerin hepsi geçmeli
const a = filterIdx(db, { q: 'FALCON starlink', yil: 2026 });
ok(a.length > 50 && a.every((i) => db.lv[db.c.lv[i]] === 'Falcon 9' && yearOf(db, i) === 2026) && a[0] > a[a.length - 1], `2026 Falcon 9 Starlink: ${a.length} (yeniden eskiye)`);
ok(filterIdx(db, { q: 'cin', yil: 2025 }).length === filterIdx(db, { ulke: 'CN', yil: 2025 }).length, 'ülke adıyla arama ("cin" = Çin)');
const f = filterIdx(db, { sonuc: 'F', yil: 2025 }), s = filterIdx(db, { sonuc: 'S', yil: 2025 });
ok(f.length > 0 && f.length + s.length === filterIdx(db, { yil: 2025 }).length, `2025: ${s.length} başarılı + ${f.length} başarısız`);

// yıllar ve özet
const py = perYear(db), k2025 = py.yillar.indexOf(2025);
ok(py.yillar[0] === 1957 && py.toplam.reduce((x, y) => x + y, 0) === n && py.toplam[k2025] === filterIdx(db, { yil: 2025 }).length, 'yıllık sayılar toplamı tutar');
ok(py.toplam[k2025] > py.toplam[py.yillar.indexOf(2015)], '2025 fırlatma sayısı 2015\'ten fazla');
const ys = yearSummary(db, 2025);
ok(ys.n === py.toplam[k2025] && ys.basarili + ys.basarisiz === ys.n && ys.roket[0][0] === 'Falcon 9' && ys.ulke[0][0] === 'US' && ys.oran > 0.9, `2025: ${ys.n} fırlatma, başarı %${(ys.oran * 100).toFixed(1)}, en çok ${ys.roket[0][0]} (${ys.roket[0][1]})`);
const codes = new Set(Array.from({ length: n }, (_, i) => countryOf(db, i)));
ok([...codes].filter((c) => c && !COUNTRY[c]).length === 0, 'her ülke kodunun adı var');
ok(countryName('CN') === 'Çin' && countryName('XX') === 'XX', 'ülke adları');

console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
