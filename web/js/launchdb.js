// Fırlatma veritabanı (saf; tarayıcı ve Node: test/test_launchdb.js): 1957'den bugüne yörüngesel ve derin uzay fırlatmaları.
// Veri: data/launchdb.json (tools/firlatma_db.mjs; GCAT — J. C. McDowell, planet4589.org/space/gcat, CC-BY-4.0). Sütunlu: c.tag (COSPAR),
// c.t (UTC saniye), c.lv (roket dizini), c.v (sürüm), c.mis (görev/uçuş adı), c.pl (öteki ad: yük ya da görev), c.flt (uçuş/itici kimliği), c.site (yer dizini), c.pad, c.ag (kuruluş
// dizini), c.r ("S" başarılı / "F" başarısız), c.fr (McDowell başarı oranı, %), c.orb (yörünge sınıfı), c.kg (yük, kg), c.pe/c.ap (km), c.inc (°).
// Yalnız Fırlatmalar sekmesinin Geçmiş ya da İstatistik görünümü açılınca indirilir (~190 KB sıkıştırılmış).

// GCAT ülke kodu -> ad (arayüz çevirir)
export const COUNTRY = {
  US: 'ABD', SU: 'SSCB', RU: 'Rusya', CN: 'Çin', F: 'Fransa', J: 'Japonya', IN: 'Hindistan', NZ: 'Yeni Zelanda', IR: 'İran', 'I-ESA': 'ESA',
  IL: 'İsrail', I: 'Uluslararası', KR: 'Güney Kore', KP: 'Kuzey Kore', 'I-ELDO': 'ELDO', CYM: 'Deniz fırlatma (Sea Launch)', UK: 'Birleşik Krallık',
  BR: 'Brezilya', D: 'Almanya', AU: 'Avustralya', GUF: 'Fransız Guyanası', KI: 'Kiribati', KE: 'Kenya', DZ: 'Cezayir',
};
// yörünge sınıfı (GCAT) -> açıklama
export const ORBIT = {
  LEO: 'Alçak yörünge', SSO: 'Güneş eşzamanlı', GTO: 'Yer eşzamanlı aktarma', GEO: 'Yer eşzamanlı', MEO: 'Orta yörünge', ISS: 'Uzay istasyonu',
  MOL: 'Molniya', EEO: 'Eliptik', HEO: 'Yüksek eliptik', LSS: 'Alçak, istasyon', STO: 'Alt GTO', MTO: 'MEO aktarma', DSO: 'Derin uzay',
};

let cache = null;
export function loadLaunchDb(url = 'data/launchdb.json') {
  if (!cache) cache = fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch((e) => { cache = null; throw e; });
  return cache;
}

export const size = (db) => (db ? db.c.t.length : 0);
export const yearOf = (db, i) => new Date(db.c.t[i] * 1000).getUTCFullYear();
// fırlatmanın ülkesi: işletmeci kuruluşun ülkesi (yoksa fırlatma yerinin)
export const countryOf = (db, i) => db.ag[db.c.ag[i]][1] || db.site[db.c.site[i]][1] || '';
export const countryName = (code) => COUNTRY[code] || code || '?';
export function row(db, i) {
  const c = db.c, s = db.site[c.site[i]], a = db.ag[c.ag[i]];
  return { i, tag: c.tag[i], t: c.t[i] * 1000, roket: db.lv[c.lv[i]], surum: c.v[i], gorev: c.mis[i], yuk: c.pl[i], ucus: c.flt[i], yer: s[0], yerUlke: s[1], enlem: s[2], boylam: s[3],
    rampa: c.pad[i], kurulus: a[0], ulke: countryOf(db, i), sonuc: c.r[i], oran: c.fr[i], yorunge: c.orb[i], kg: c.kg[i], perije: c.pe[i], apoje: c.ap[i], egim: c.inc[i] };
}
// başarı: McDowell'in kuralı (S başarılı; oran verilmişse ≥ 75)
export const success = (db, i) => db.c.r[i] === 'S' && (db.c.fr[i] === null || db.c.fr[i] >= 75);
export const partial = (db, i) => db.c.fr[i] !== null && db.c.fr[i] < 100;

const fold = (s) => String(s || '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
// arama ve süzme: q (roket, görev, COSPAR, yer, kuruluş; boşlukla ayrılan her sözcük geçmeli), yil, ulke, sonuc ('S'|'F') -> dizinler (yeniden eskiye)
export function filterIdx(db, { q = '', yil = null, ulke = null, sonuc = null } = {}) {
  const words = fold(q).split(/\s+/).filter(Boolean), out = [];
  for (let i = size(db) - 1; i >= 0; i--) {
    if (yil !== null && yearOf(db, i) !== yil) continue;
    if (ulke && countryOf(db, i) !== ulke) continue;
    if (sonuc === 'S' && !success(db, i)) continue;
    if (sonuc === 'F' && success(db, i)) continue;
    if (words.length) {
      const hay = fold([db.c.tag[i], db.lv[db.c.lv[i]], db.c.v[i], db.c.mis[i], db.c.pl[i], db.c.flt[i], db.site[db.c.site[i]][0], db.ag[db.c.ag[i]][0], countryName(countryOf(db, i))].join(' '));
      if (!words.every((w) => hay.includes(w))) continue;
    }
    out.push(i);
  }
  // aramada ifadenin bütün olarak geçtiği kayıtlar öne ("apollo 11": önce Apollo 11, sonra yük adında "CM-111" geçenler); eşitlikte yeniden eskiye
  if (words.length > 1) {
    const phrase = words.join(' '), score = (i) => (fold(db.c.mis[i]).includes(phrase) ? 2 : fold(`${db.lv[db.c.lv[i]]} ${db.c.mis[i]} ${db.c.pl[i]}`).includes(phrase) ? 1 : 0);
    const sc = new Map(out.map((i) => [i, score(i)]));
    out.sort((a, b) => sc.get(b) - sc.get(a) || b - a);
  }
  return out;
}
// yıllara göre: { yillar: [y0..y1], toplam: [], basarisiz: [] }
export function perYear(db) {
  if (!size(db)) return { yillar: [], toplam: [], basarisiz: [] };
  const y0 = yearOf(db, 0), y1 = yearOf(db, size(db) - 1), n = y1 - y0 + 1, toplam = new Array(n).fill(0), basarisiz = new Array(n).fill(0);
  for (let i = 0; i < size(db); i++) { const k = yearOf(db, i) - y0; toplam[k]++; if (!success(db, i)) basarisiz[k]++; }
  return { yillar: Array.from({ length: n }, (_, k) => y0 + k), toplam, basarisiz };
}
// bir yılın özeti: sayı, başarı, en çok fırlatan roketler/ülkeler/yerler (azalan; eşitlikte ada göre)
export function yearSummary(db, yil) {
  const lv = new Map(), ul = new Map(), yer = new Map(), orb = new Map(); let n = 0, ok = 0;
  const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (let i = 0; i < size(db); i++) {
    if (yearOf(db, i) !== yil) continue;
    n++; if (success(db, i)) ok++;
    inc(lv, db.lv[db.c.lv[i]]); inc(ul, countryOf(db, i)); inc(yer, db.site[db.c.site[i]][0]); inc(orb, db.c.orb[i] || '?');
  }
  const top = (m, k = 6) => [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, k);
  return { yil, n, basarili: ok, basarisiz: n - ok, oran: n ? ok / n : null, roket: top(lv), ulke: top(ul), yer: top(yer), yorunge: top(orb) };
}
// COSPAR -> dizin (canlı LL2 kayıtlarını veritabanıyla eşlemek için)
export function tagIndex(db) {
  if (!db._tags) db._tags = new Map(db.c.tag.map((t, i) => [t, i]));
  return db._tags;
}
