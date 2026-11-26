// lookstar19 sitesi (site/) saf modülleri ve verisi — Node 20+: cd web && node test/test_site.js
//  veri: 33 cisim, alanlar, modeller sürüm paketinde; arama ve kısa ad; iki dil sözlüğü aynı yapıda; biçimlendirme (TR ondalık virgül);
//  fırlatma eşlemesi (resmî yayın önce, "Unknown" gösterilmez) ve sıradaki fırlatma; sayfa dosyaları ve sabitler.
import fs from 'node:fs';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const rd = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

// 1) veri
const data = JSON.parse(rd('../../site/data/asteroids.json')), O = data.objects;
const fin = (x) => Number.isFinite(x);
check('veri: 33 cisim, kimlikler tekil, alınma tarihi ve kaynak yazılı', O.length === 33 && new Set(O.map((o) => o.id)).size === 33 && /^\d{4}-\d\d-\d\d$/.test(data.retrieved) && /JPL/.test(data.source));
check('veri: her cismin yörünge elementleri, epok ve MOID sayı', O.every((o) => ['a', 'e', 'i', 'om', 'w', 'ma', 'q', 'ad', 'per'].every((k) => fin(o.elements[k])) && fin(o.epoch.jd) && fin(o.moid) && o.elements.e >= 0 && o.elements.e < 1));
check('veri: model bilgisi (yöntem, boyutlar, üçgen, iki dilde kaynak)', O.every((o) => ['radar', 'spacecraft'].includes(o.model.method) && o.model.dims.length === 3 && o.model.dims.every((x) => x > 0) && o.model.tris > 0 && o.model.source.tr && o.model.source.en && !/ vd\.|modeli/.test(o.model.source.en)));
const man = JSON.parse(rd('../../varliklar.json')), files = man.paketler.asteroit.dosyalar;
check('veri: her şekil modeli sürüm paketinde (scripts/modeller.mjs indirir, özetini denetler)', O.every((o) => files[`web/models/ast/${o.model.key}.glb`]));
const kat = JSON.parse(rd('../models/ast/katalog.json'));
check('veri: LS19 kataloğundaki her model sitede', Object.values(kat).every((m) => O.some((o) => o.model.key === m.key)) && Object.keys(kat).length === O.length);

// 2) arama ve kısa ad
const { matchObjects, shortName } = await import('../../site/lib/asteroids-match.js');
const ids = (q) => matchObjects(O, q).map((o) => o.id);
check('arama: numara, ad, geçici gösterim; boşluk ve büyük harf duyarsız; başlayan önce', ids('433')[0] === 'eros' && ids('BENNU')[0] === 'bennu' && ids('1998 ky')[0] === '1998ky26' && ids('1998ky26')[0] === '1998ky26' && ids('zzz').length === 0 && ids('').length === 33);
const by = (id) => O.find((o) => o.id === id);
check('kısa ad: adlı cisim adıyla, adsız numaralı parantezsiz geçici gösterimle', shortName(by('apophis')) === 'Apophis' && shortName(by('a8567')) === '1996 HW1' && shortName(by('1998ky26')) === '1998 KY26' && shortName(by('kw4a')) === 'Moshup');

// 3) iki dil
const I = await import('../../site/lib/i18n.js');
const shape = (x) => (typeof x === 'function' ? 'fn' : Array.isArray(x) ? `[${x.length}:${x.map(shape).join(',')}]` : x && typeof x === 'object' ? `{${Object.keys(x).sort().map((k) => k + ':' + shape(x[k])).join(',')}}` : typeof x);
const en = I.t('en'), tr = I.t('tr'), noCls = (o) => { const c = { ...o }; delete c.cls; return c; };
check('dil: İngilizce ve Türkçe sözlükler aynı yapıda (her metin iki dilde)', shape(noCls(en)) === shape(noCls(tr)));
check('dil: Türkçe sınıf adları; bilinmeyen sınıf kaynağın adıyla', I.clsName('tr', { code: 'MBA', name: 'Main-belt Asteroid' }) === 'Ana kuşak' && I.clsName('en', { code: 'MBA', name: 'Main-belt Asteroid' }) === 'Main-belt Asteroid' && I.clsName('tr', { code: 'XYZ', name: 'Other' }) === 'Other');
check('biçim: Türkçede ondalık virgül, İngilizcede nokta; anlamlı basamak', I.num('tr', 1.12643, 4) === '1,1264' && I.num('en', 1.12643, 4) === '1.1264' && I.sig('en', 0.0001079, 3) === '0.000108' && I.sig('en', 939.4, 3) === '939' && I.num('en', null) === null);
check('biçim: tarih ve saat UTC', I.date('en', '2026-11-26') === '26 Nov 2026' && /^27 Nov 2026, 00:05 UTC$/.test(I.dateTime('en', '2026-11-27T00:05:00Z')));
check('kaynaklar: her satır https bağlantılı, iki dilde aynı sayıda', en.src.rows.length === tr.src.rows.length && [...en.src.rows, ...tr.src.rows].every((r) => /^https:\/\//.test(r[3])));

// 4) fırlatmalar
const Lc = await import('../../site/lib/launches.js');
const raw = {
  id: 'x', name: 'Falcon 9 | Test', net: '2026-11-29T04:39:00Z', status: { abbrev: 'Go', name: 'Go for Launch' }, webcast_live: false,
  rocket: { configuration: { full_name: 'Falcon 9 Block 5' } }, launch_service_provider: { name: 'SpaceX' },
  mission: { name: 'Test', type: 'Unknown', orbit: { name: 'Unknown' } }, pad: { name: 'SLC-4E', location: { name: 'Vandenberg' } },
  vid_urls: [{ url: 'https://example.org/b', type: { id: 2 }, priority: 10 }, { url: 'http://insecure', type: { id: 1 } }, { url: 'https://example.org/a', type: { id: 1 }, priority: 1, title: 'Official' }],
};
const m = Lc.mapLaunch(raw);
check('fırlatma: resmî yayın önce, https olmayan atılır', m.streams.length === 2 && m.streams[0].url === 'https://example.org/a' && m.streams[0].official && !m.streams[1].official);
check('fırlatma: kaynağın "Unknown" değerleri gösterilmez', m.mission.orbit === null && m.mission.type === null && m.vehicle === 'Falcon 9 Block 5');
const now = Date.parse('2026-11-28T00:00:00Z');
const L = [{ net: '2026-11-27T00:00:00Z', status: { abbrev: 'Go' } }, { net: '2026-11-28T06:00:00Z', status: { abbrev: 'Success' } }, { net: '2026-11-29T00:00:00Z', status: { abbrev: 'Go' } }];
check('fırlatma: sıradaki, zamanı geçmemiş ve sonuçlanmamış ilk kayıt', Lc.nextLaunch(L, now) === L[2] && Lc.nextLaunch([], now) === null);
check('fırlatma: Launch Library 2 ucu LS19 ile aynı sürüm; 30 dk yenileme', /ll\.thespacedevs\.com\/2\.3\.0\/launches\/upcoming\//.test(Lc.LL2_UPCOMING) && Lc.REVALIDATE === 1800);

// 5) sayfa dosyaları ve sabitler
const pages = ['app/[lang]/page.jsx', 'app/[lang]/asteroids/page.jsx', 'app/[lang]/asteroids/[id]/page.jsx', 'app/[lang]/launches/page.jsx', 'app/[lang]/sources/page.jsx'];
check('sayfalar: ana sayfa, dizin, cisim, fırlatmalar, kaynaklar', pages.every((p) => fs.existsSync(new URL(`../../site/${p}`, import.meta.url))));
const C = await import('../../site/lib/config.js'), A = await import('../../site/lib/asteroids-match.js');
check('sabitler: diller en/tr, varsayılan en; kök /en’e yönlenir', C.LANGS.join() === 'en,tr' && C.DEFAULT_LANG === 'en' && /destination: '\/en'/.test(rd('../../site/next.config.mjs')) && !!A);
check('LS19 bağlantısı: saptırma deneyi hedef parametresiyle (labtext.js LINK_KEYS)', /exp=saptirma&hedef=\$\{encodeURIComponent\(o\.des\)\}/.test(rd('../../site/lib/asteroids.js')) && /'hedef'/.test(rd('../js/labtext.js')));

if (fail) { console.log(`\n${fail} hata`); process.exit(1); }
console.log('\nTüm lookstar19 denetimleri geçti');
