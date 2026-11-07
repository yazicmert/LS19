// Yük veritabanı (data/payloads/<yıl>.json, tools/firlatma_db.mjs; GCAT — J. McDowell, CC-BY-4.0; Vikipedi eşlemesi Wikidata) ve yardımcıları (js/payloads.js):
// bütünlük, bilinen görevler (Sputnik 1, Vanguard TV3, Apollo 11, Hubble, Voyager 1, JWST, Perseverance), durum/amaç metinleri, yörünge sınıfı, gruplama,
// fırlatma veritabanındaki amaç ve yük adı sütunları (süzgeç, arama), Vikipedi özeti isteği.
import fs from 'fs';
import { payloadsOf, statusOf, fill, purposes, disciplines, orbitInfo, parseVague, stateName, groupPayloads, statusCounts, groupOf, wikiPick, wikiSummary, GROUPS, PURPOSE } from '../js/payloads.js';
import { filterIdx, tagIndex, row } from '../js/launchdb.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } else console.log('tamam', m); };
const dir = new URL('../data/payloads/', import.meta.url);
const db = JSON.parse(fs.readFileSync(new URL('../data/launchdb.json', import.meta.url), 'utf8'));
const years = new Map(fs.readdirSync(dir).filter((f) => /^\d{4}\.json$/.test(f)).map((f) => [+f.slice(0, 4), JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'))]));
const T = tagIndex(db), yearOfTag = (tg) => new Date(db.c.t[T.get(tg)] * 1000).getUTCFullYear();
const get = (tg) => payloadsOf(years.get(yearOfTag(tg)), tg) || [];
const say = (p) => { const s = statusOf(p); return fill(s.tpl, s.args); };

// bütünlük
let n = 0, wiki = 0, badTag = 0, badOrg = 0, badSt = 0;
for (const [y, d] of years) {
  if (d.meta.lisans !== 'CC-BY-4.0' || !/McDowell/.test(d.meta.kaynak) || d.meta.yil !== y) badTag++;
  for (const [tg, list] of Object.entries(d.L)) {
    if (!T.has(tg) || yearOfTag(tg) !== y) badTag++;
    for (const p of list) { n++; if (p.we || p.wt) wiki++; if (p.o != null && !Array.isArray(d.org[p.o])) badOrg++; if (!p.st || !p.ad || !p.p) badSt++; }
  }
}
ok(years.size >= 70 && years.has(1957) && n > 30000, `${years.size} yıl dosyası, ${n} yük`);
ok(!badTag && !badOrg && !badSt, 'her kayıt doğru yılın dosyasında, fırlatma veritabanında var; sahip dizini, durum, ad ve parça dolu');
ok(wiki > 3000, `${wiki} yükün Vikipedi maddesi var`);
ok(db.c.am.length === db.c.t.length && db.c.ny.length === db.c.t.length && db.c.yn.length === db.c.t.length, 'fırlatma veritabanında amaç, yük sayısı ve yük adı sütunları');
ok(db.c.tag.every((tg, i) => db.c.ny[i] === get(tg).length), 'yük sayısı sütunu yük dosyalarıyla tutarlı');

// bilinen görevler
const [sp] = get('1957 ALP');
ok(sp && sp.st === 'R' && sp.sd === '1958-01-04?' && sp.we === 'Sputnik 1' && sp.k === 'TECH' && say(sp) === 'Atmosfere girip yandı', 'Sputnik 1: 4 Ocak 1958 (belirsiz) atmosfere girdi; Vikipedi: Sputnik 1');
const [vg] = get('1957-F01');
ok(vg && vg.st === 'F' && statusOf(vg).kind === 'fail', 'Vanguard TV3: yörüngeye ulaşamadı');
const ap = get('1969-059'), csm = ap.find((p) => p.p === '1969-059A'), lm = ap.find((p) => p.p === '1969-059C');
ok(csm && csm.st === 'L' && csm.sd === '1969-07-24' && csm.k === 'SS' && /Columbia/.test(csm.ad2) && csm.wt, 'Apollo 11 komuta modülü Columbia: 24 Temmuz 1969 Dünya\'ya döndü');
ok(lm && /Eagle/.test(lm.ad2) && ap.some((p) => p.st === 'S' && p.sb === 'Luna' && say(p) === 'Ay yüzeyinde, etkin değil'), 'Apollo 11: Eagle ve Ay yüzeyinde kalan deney paketi');
const hst = get('1990-037').find((p) => p.n === 20580);
ok(hst && hst.st === 'O' && hst.ak && hst.yg && hst.k === 'AST' && disciplines(hst).join() === 'optik astronomi,morötesi astronomi' && hst.wt === 'Hubble Uzay Teleskobu', 'Hubble: yörüngede, çalışıyor; astronomi (optik, morötesi); Türkçe madde');
ok(say(hst) === 'Yörüngede, çalışıyor' && statusOf(hst).live && statusOf(hst).kind === 'on' && orbitInfo(hst).ad === 'Alçak (LEO)' && Math.abs(orbitInfo(hst).periyot - 94.5) < 1.5, `Hubble yörüngesi: ${orbitInfo(hst).ad}, ${orbitInfo(hst).periyot.toFixed(1)} dk`);
ok(hst.sahip && hst.sahip[0] === 'GSFC' && hst.sahip[2] === 'US', 'Hubble sahibi: GSFC (ABD)');
const [vo] = get('1977-084');
ok(vo && vo.st === 'H' && vo.k === 'PLAN' && statusOf(vo).kind === 'deep' && statusOf(vo).on && !statusOf(vo).live && say(vo) === 'Güneş çevresinde yörüngede, çalışıyor', 'Voyager 1: Güneş çevresinde, çalışıyor (derin uzay, 3B Dünya sahnesinde değil)');
const [jw] = get('2021-130');
ok(jw && say(jw) === 'Güneş–Dünya L2 noktası yörüngesinde, çalışıyor' && purposes(jw)[0].ad === 'Astronomi', 'JWST: Güneş–Dünya L2 noktası yörüngesinde, çalışıyor; astronomi');
const pv = get('2020-052').find((p) => p.ad === 'Perseverance');
ok(pv && say(pv) === 'Mars yüzeyinde çalışıyor' && pv.k === 'PLAN', 'Perseverance: Mars yüzeyinde çalışıyor');

// gruplama: kalabalık fırlatma tek satır, sayılar tutar
const sl = get('2025-003'), gs = groupPayloads(sl);
ok(sl.length > 20 && gs.length < sl.length && gs.some((g) => g.list && /Starlink/.test(g.ad)), `2025-003: ${sl.length} yük -> ${gs.length} satır (Starlink grubu)`);
const g0 = gs.find((g) => g.list), sc = statusCounts(g0.list);
ok(sc.reduce((s, x) => s + x[1], 0) === g0.list.length, `grup durumu: ${sc.map((x) => `${x[0]} ${x[1]}`).join(', ')}`);
ok(groupPayloads(get('1990-037')).every((g) => g.one), 'az yüklü fırlatmada her yük ayrı satır');

// amaç: süzgeç ve arama
ok(GROUPS.every(([, , ks]) => ks.every((k) => PURPOSE[k])) && groupOf('IMG/TECH') === 'yer' && groupOf('COM?') === 'com' && groupOf('') === '', 'amaç grupları');
const gez = new Set(filterIdx(db, { amac: 'gez' }).map((i) => db.c.tag[i])), ins = new Set(filterIdx(db, { amac: 'ins' }).map((i) => db.c.tag[i]));
ok(gez.has('1977-084') && gez.has('2020-052') && ins.has('1969-059') && !ins.has('1977-084'), `amaç süzgeci: gezegen ${gez.size}, insanlı ${ins.size}`);
ok(row(db, filterIdx(db, { q: 'hubble' })[0]).tag === '1990-037', 'yük adıyla arama: "hubble" -> önce STS-31 (1990-037)');
ok(row(db, filterIdx(db, { q: 'perseverance' })[0]).tag === '2020-052' && filterIdx(db, { q: 'jwst' }).map((i) => db.c.tag[i]).includes('2021-130'), 'Perseverance, JWST aramayla bulunur');
ok(row(db, filterIdx(db, { q: 'iss' })[0]).gorev.startsWith('ISS'), 'sözcük başında geçen önde ("iss": ISS uçuşları, "mission" değil)');

// yörünge sınıfları, tarih, ülke adları
const oc = (pe, ap, inc) => orbitInfo({ pe, ap, inc }).ad;
ok(oc(35786, 35786, 0.05) === 'Yer eşzamanlı (GEO)' && oc(200, 35786, 27) === 'Yer eşzamanlı aktarma (GTO)' && oc(500, 39700, 63.4) === 'Molniya' && oc(700, 705, 98.2) === 'Alçak, Güneş eşzamanlı' && oc(20180, 20200, 55) === 'Orta (MEO)', 'yörünge sınıfları (GEO, GTO, Molniya, SSO, MEO)');
const pvd = parseVague('1958-01-04?'), pm = parseVague('1969-07');
ok(pvd.ms === Date.UTC(1958, 0, 4) && pvd.belirsiz && pvd.kesinlik === 'gun' && pm.kesinlik === 'ay' && parseVague('x') === null, 'belirsiz tarih çözümü');
ok(stateName('TR', 'tr') === 'Türkiye' && stateName('S', 'en') === 'Sweden' && stateName('UK', 'tr') === 'Birleşik Krallık' && stateName('SU') === 'SSCB' && stateName('I-ESA') === 'ESA', 'ülke adları (GCAT -> ISO, yerel ad)');
ok(wikiPick({ we: 'A', wt: 'B' }, 'tr').lang === 'tr' && wikiPick({ we: 'A', wt: 'B' }, 'en').title === 'A' && wikiPick({ we: 'A' }, 'tr').lang === 'en' && wikiPick({}, 'tr') === null, 'Vikipedi dili: arayüz dilinde madde varsa o, yoksa öteki');

// Vikipedi özeti: REST isteği (alt çizgili başlık, Api-User-Agent), hata önbelleğe girmez
let seen = null, calls = 0;
const fake = async (u, o) => { seen = { u, o }; calls++; return calls === 1 ? new Response('x', { status: 429 }) : new Response(JSON.stringify({ title: 'Hubble Uzay Teleskobu', extract: 'Hubble, 1990’da…', content_urls: { desktop: { page: 'https://tr.wikipedia.org/wiki/Hubble_Uzay_Teleskobu' } } })); };
let err = null; try { await wikiSummary('Hubble Uzay Teleskobu', 'tr', fake); } catch (e) { err = e; }
const w = await wikiSummary('Hubble Uzay Teleskobu', 'tr', fake);
ok(err && /429/.test(err.message) && w.metin.startsWith('Hubble') && seen.u === 'https://tr.wikipedia.org/api/rest_v1/page/summary/Hubble_Uzay_Teleskobu' && /github\.com\/yazicmert\/LS19/.test(seen.o.headers['Api-User-Agent']), 'Vikipedi özeti: REST, Api-User-Agent, hata sonrası yeniden denenir');

console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
