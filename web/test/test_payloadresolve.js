// Görev yükü çözümleyici (js/payloadresolve.js): görev adından aday adlar, yük ailesi dizini (data/payload_families.json), LL2 görev türü,
// Wikidata sonuçlarının doğrulanması (COSPAR, fırlatma tarihi, ad) ve istek akışı (taklit yanıtlarla; ağ yok).
import fs from 'fs';
import { nameCandidates, familyLookup, ll2Group, wikidataItems, pickItem, wikidataLookup, wikidataQuery } from '../js/payloadresolve.js';
import { nameStem, groupOf } from '../js/payloads.js';

let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('HATA', m); } else console.log('tamam', m); };
const F = JSON.parse(fs.readFileSync(new URL('../data/payload_families.json', import.meta.url), 'utf8'));
const db = JSON.parse(fs.readFileSync(new URL('../data/launchdb.json', import.meta.url), 'utf8'));

// her fırlatmanın yük listesi var (son aylar GCAT satcat100k ile)
ok(db.c.ny.every((n) => n > 0), `${db.c.ny.length} fırlatmanın hepsinde yük listesi`);

// ad kökü ve aday adlar
ok(nameStem('Starlink Group 15-18') === 'starlink' && nameStem('Starlink 32713') === 'starlink' && nameStem('Glonass-K1 No. 19 (Kosmos 2620)') === 'glonass-k' &&
  nameStem('Progress MS-35 (96P)') === 'progress ms' && nameStem('Yaogan 51-07 to 09') === 'yaogan' && nameStem('GPS III-9') === 'gps iii' && nameStem('Unknown Payload') === '', 'ad kökü');
const mmx = nameCandidates('Martian Moons eXploration (MMX)');
ok(mmx[0] === 'Martian Moons eXploration' && mmx[1] === 'MMX' && mmx.length === 3, 'aday adlar: ayraç dışı, ayraç içi, tam ad');
ok(nameCandidates('Transporter 18 (Dedicated SSO Rideshare)').join('|') === 'Transporter 18|Transporter 18 (Dedicated SSO Rideshare)' && !nameCandidates('Unknown Payload').length &&
  !nameCandidates('4 satellites').length && !nameCandidates('SatNet LEO Group TBD?').some((x) => x.includes('?')), 'paylaşımlı uçuş eki aday değil; "Unknown Payload", "4 satellites" aranmaz; "?" atılır');

// yük ailesi
const fam = F.f;
ok(Object.keys(fam).length > 3000 && F.meta.lisans === 'CC-BY-4.0', `${Object.keys(fam).length} yük ailesi (CC-BY-4.0)`);
const sl = familyLookup(nameCandidates('Starlink Group 15-18'), fam), gl = familyLookup(nameCandidates('Glonass-K1 No. 19 (Kosmos 2620)'), fam);
ok(sl && sl.kok === 'starlink' && sl.k === 'COM' && sl.n > 10000 && sl.ulke === 'US', `Starlink ailesi: ${sl && sl.n} yük, iletişim, ABD`);
ok(gl && gl.k === 'NAV' && gl.ulke === 'RU', 'Glonass-K ailesi: seyrüsefer, Rusya');
ok(familyLookup(['Progress MS-35'], fam).k === 'SS' && familyLookup(['NVS-03'], fam).k === 'NAV' && familyLookup(['Crew-13'], fam) === null, 'Progress MS kargo, NVS seyrüsefer; "Crew" gibi genel kök eşleşmez');
ok(familyLookup(['SDA Tranche 1 Transport Layer A'], fam) === null || familyLookup(['SDA Tranche 1 Transport Layer A'], fam).n >= 3, 'kısaltılmış kök yalnız en az 3 yüklü ailede');

// LL2 görev türü
ok(ll2Group('Communications') === 'com' && ll2Group('Planetary Science') === 'gez' && ll2Group('Resupply') === 'ins' && ll2Group('Government/Top Secret') === 'ask' && ll2Group('Dedicated Rideshare') === '', 'LL2 görev türü -> amaç grubu');
ok(groupOf(sl.k) === ll2Group('Communications'), 'aile amacı ile LL2 türü tutarlı (Starlink)');

// Wikidata satırları ve doğrulama
const B = (id, label, o = {}) => ({ i: { value: 'http://www.wikidata.org/entity/' + id }, iLabel: { value: label }, ...(o.date ? { date: { value: o.date } } : {}), ...(o.cospar ? { cospar: { value: o.cospar } } : {}),
  ...(o.site ? { site: { value: o.site } } : {}), ...(o.en ? { en: { value: 'https://en.wikipedia.org/wiki/' + o.en } } : {}), ...(o.den ? { den: { value: o.den } } : {}) });
const items = wikidataItems([B('Q1', 'Martian Moons eXploration', { date: '2026-10-19T00:00:00Z', cospar: '2026-236A', site: 'https://www.mmx.jaxa.jp/', en: 'Martian_Moons_eXploration', den: 'JAXA mission' }),
  B('Q1', 'Martian Moons eXploration', { site: 'https://www.mmx.jaxa.jp/en/' }), B('Q1', 'Martian Moons eXploration', { site: 'http://insecure.example' })]);
ok(items.length === 1 && items[0].site.length === 2 && items[0].we === 'Martian Moons eXploration' && items[0].cospar[0] === '2026-236A', 'aynı öğenin satırları birleşir; yalnız https site, en çok 2');
const T = Date.parse('2026-10-19T02:00:00Z'), now = Date.parse('2026-11-07T00:00:00Z');
ok(pickItem(items, 'MMX', { ms: T, cospar: '2026-236', now }) === items[0], 'COSPAR tutarsa kabul');
const kos = wikidataItems([B('Q2', 'Kosmos 2595', { date: '2025-09-13T00:00:00Z', cospar: '2025-206B' })]);
ok(pickItem(kos, 'Glonass-K1 No. 19', { ms: Date.parse('2026-09-17'), now }) === null, 'tarihi tutmayan öğe reddedilir ("Glonass-K1" -> başka Kosmos)');
ok(pickItem(wikidataItems([B('Q3', 'Artemis III')]), 'Artemis III', { ms: Date.parse('2027-06-01'), now }) !== null && pickItem(wikidataItems([B('Q4', 'Artemis program')]), 'Artemis III', { ms: Date.parse('2027-06-01'), now }) === null,
  'tarihsiz öğe yalnız adı aynıysa');
ok(pickItem(wikidataItems([B('Q5', 'X', { date: '2027-07-10T00:00:00Z' })]), 'X', { ms: Date.parse('2027-06-01'), now }) !== null && pickItem(wikidataItems([B('Q5', 'X', { date: '2026-10-25T00:00:00Z' })]), 'X', { ms: Date.parse('2026-10-19'), now }) === null,
  'yaklaşan fırlatmada ±60 gün, geçmişte ±3 gün');
ok(/mwapi:search "Crew-13"/.test(wikidataQuery('Crew-13')) && /wd:Q40218/.test(wikidataQuery('x')) && wikidataQuery('a"b').includes('"a\\"b"'), 'sorgu: ad JSON olarak gömülür (tırnak kaçar), uzay aracı sınıfı');

// istek akışı: adlar sırayla denenir, ilk doğrulanan döner; hata saklanmaz
let calls = [];
const resp = (bindings) => new Response(JSON.stringify({ results: { bindings } }), { status: 200 });
const f1 = async (u, o) => { calls.push(decodeURIComponent(u)); return /search "Martian Moons eXploration"/.test(decodeURIComponent(u)) ? resp([]) : resp([B('Q1', 'MMX', { cospar: '2026-236A', date: '2026-10-19T00:00:00Z' })]); };
const r1 = await wikidataLookup(['Martian Moons eXploration', 'MMX'], { ms: T, cospar: '2026-236', now }, f1);
ok(r1 && r1.id === 'Q1' && calls.length === 2 && calls.every((u) => u.startsWith('https://query.wikidata.org/sparql?query=')), 'ilk ad sonuçsuz, ikincisi bulunur (2 istek)');
const r2 = await wikidataLookup(['Martian Moons eXploration', 'MMX'], { ms: T, cospar: '2026-236', now }, f1);
ok(r2 === r1 && calls.length === 2, 'sonuç saklanır, yeniden istenmez');
let n429 = 0; const f2 = async () => { n429++; return n429 === 1 ? new Response('çok istek', { status: 429 }) : resp([]); };
let e1 = null; try { await wikidataLookup(['Yok'], {}, f2); } catch (e) { e1 = e; }
const r3 = await wikidataLookup(['Yok'], {}, f2);
ok(e1 && /429/.test(e1.message) && r3 === null && n429 === 2, 'hata saklanmaz, yeniden denenir; bulunamazsa null');

console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
