// lookstar19 sitesi (site/) saf modülleri ve verisi — Node 20+: cd web && node test/test_site.js
//  veri: 33 cisim, alanlar, modeller sürüm paketinde; arama ve kısa ad; iki dil sözlüğü aynı yapıda; biçimlendirme (TR ondalık virgül);
//  fırlatma eşlemesi (resmî yayın önce, "Unknown" gösterilmez), sıradaki fırlatma, veri alınamazsa derlemede not / yayında eski sayfa;
//  fırlatma ayrıntısı (kaydedilmiş LL2 örnekleri: açıklanmamış yük, kademe/iniş, mürettebat, yörünge biçimi, bağlantı süzgeci, GCAT, CelesTrak GP);
//  sayfa dosyaları ve sabitler; yayın altyapısı (meta veri, güvenlik başlıkları, Vercel ayarı, 404, yazı tipi).
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
const fakeFetch = (res) => async (url, opt) => { fakeFetch.last = opt; if (res instanceof Error) throw res; return res; };
const okRes = (j) => ({ ok: true, status: 200, json: async () => j });
const good = await Lc.getUpcoming({ fetchImpl: fakeFetch(okRes({ results: [raw, { ...raw, id: 'y', net: 'TBD' }, { ...raw, id: 'z', name: null }] })), atBuild: false });
check('fırlatma verisi: geçerli yanıt; zamanı ya da adı olmayan kayıt atılır; zaman aşımı sinyali ve önbellek süresi istekte',
  good.ok && good.launches.length === 1 && good.launches[0].id === 'x' && fakeFetch.last.signal instanceof AbortSignal && fakeFetch.last.next.revalidate === 1800 && Lc.TIMEOUT_MS <= 15000);
const atBuild = await Promise.all([{ ok: false, status: 429 }, new Error('timeout'), okRes({ detail: 'x' })].map((r) => Lc.getUpcoming({ fetchImpl: fakeFetch(r), atBuild: true })));
check('fırlatma verisi derlemede alınamazsa: sayfa "veri yok" notuyla derlenir (429, zaman aşımı, beklenmeyen biçim)', atBuild.every((x) => x.ok === false && x.launches.length === 0) && atBuild[0].status === 'HTTP 429');
const thrown = await Promise.all([{ ok: false, status: 429 }, new Error('timeout')].map((r) => Lc.getUpcoming({ fetchImpl: fakeFetch(r), atBuild: false }).then(() => null, (e) => e.message)));
check('fırlatma verisi yayında alınamazsa hata fırlatılır (Next son başarılı sayfayı sunmaya devam eder)', thrown.every((m) => m && /Launch Library 2/.test(m)));

// 4b) fırlatma ayrıntısı (/launches/[id]): kaydedilmiş Launch Library 2 örnekleri (fixtures/ll2_ayrinti.json: Long March 6C "Unknown Payload",
// Cygnus NG-25, USSF-380, Starlink, SatNet "TBD?", Shenzhou 24, Yaogan 49) ve CelesTrak GP örneği (fixtures/gp_firlatma.json)
const LD = await import('../../site/lib/launch-detail.js');
const ld_FX = JSON.parse(rd('./fixtures/ll2_ayrinti.json')).results, ld_fx = (re) => ld_FX.find((r) => re.test(r.name));
check('yük durumu: "Unknown Payload"/TBD açıklanmamış, "…TBD?" kısmen, ad bilinir',
  ['Unknown Payload', 'TBD', 'unknown', '', null].every((n) => Lc.payloadState(n) === 'unknown') && Lc.payloadState('SatNet LEO Group TBD?') === 'partial' && Lc.payloadState('Starlink Group 15-21') === 'known');
const ld_cz = LD.mapLaunchDetail(ld_fx(/Long March 6C/)), ld_czc = Lc.mapLaunch(ld_fx(/Long March 6C/));
check('bilinmeyen yük: ad, tür, yörünge ("N/A"), açıklama ("Details TBD.") gösterilmez; kaynağın bildikleri (fırlatıcı, araç, rampa, pencere, güncellemeler) kalır',
  ld_cz.payload === 'unknown' && ld_cz.mission.name === null && ld_cz.mission.type === null && ld_cz.mission.orbit === null && ld_cz.mission.description === null
  && ld_czc.payload === 'unknown' && ld_czc.mission.name === null && ld_cz.provider.abbrev === 'CASC' && ld_cz.provider.countries[0].code === 'CN' && ld_cz.vehicle.name === 'Long March 6C'
  && ld_cz.pad.tz === 'Asia/Shanghai' && Math.abs(ld_cz.pad.lat - 38.86) < 0.01 && ld_cz.windowStart < ld_cz.windowEnd && ld_cz.updates.length === 2 && ld_cz.updates[0].on > ld_cz.updates[1].on && /NOTAM/.test(ld_cz.updates[1].comment));
check('bilinmeyen yük: iki dilde "açıklanmadı" metni, başlık araçtan; GCAT bağlamı (aynı aracın önceki uçuşları) yükü değil',
  /Unknown Payload/.test(en.launch.unknownNote('Long March 6C', 'CASC')) && /tahmin edilmez/.test(tr.launch.unknownNote('Long March 6C', 'CASC')) && en.launch.unknownTitle('Long March 6C') === 'Long March 6C launch'
  && /not the payload/.test(en.launch.gcatLead('X', 2)) && /yükü değildir/.test(tr.launch.gcatLead('X', 2)));
const ld_cyg = LD.mapLaunchDetail(ld_fx(/Cygnus/));
check('kademe: B1096 9. uçuş, yeniden kullanım, önceki uçuş ve arada geçen süre, RTLS iniş LZ-40 (0,3 km); programlar CRS ve ISS',
  ld_cyg.stages.length === 1 && ld_cyg.stages[0].serial === 'B1096' && ld_cyg.stages[0].flight === 9 && ld_cyg.stages[0].reused === true && ld_cyg.stages[0].turnaround === 47 * 86400 + 5 * 3600 + 13 * 60 + 16
  && ld_cyg.stages[0].landing.abbrev === 'RTLS' && ld_cyg.stages[0].landing.locAbbrev === 'LZ-40' && ld_cyg.stages[0].landing.downrange === 0.3 && ld_cyg.stages[0].landing.success === null
  && ld_cyg.programs.map((p) => p.name).join() === 'Commercial Resupply Services,International Space Station' && ld_cyg.vehicle.leo === 22800 && ld_cyg.vehicle.reusable === true);
check('geri sayım çizelgesi T−0’a göre sıralı (saniye); resmî yayın önce; Flight Club bağlantısı',
  ld_cyg.timeline.length > 10 && ld_cyg.timeline.every((e, k, a) => !k || a[k - 1].t <= e.t) && ld_cyg.timeline[0].t === -2280 && ld_cyg.links.vid[0].official && /^https:\/\/flightclub\.io\//.test(ld_cyg.links.flightclub));
const slc = Lc.mapLaunch(ld_fx(/Starlink/)), ld_us = LD.mapLaunchDetail(ld_fx(/USSF-380/));
check('müşteri ve program: USSF (devlet, US), Starlink programı; atanmamış itici seri no gösterilmez; liste satırı açıklama taşımaz',
  ld_us.mission.agencies[0].name === 'United States Space Force' && ld_us.mission.agencies[0].type === 'Government' && ld_us.mission.agencies[0].countries[0].code === 'US' && ld_us.stages[0].landing.abbrev === 'ASDS'
  && slc.programs.includes('Starlink') && slc.booster.serial === null && slc.booster.landing === 'ASDS' && !('description' in Lc.listRow(slc).mission) && Lc.listRow(slc).streams.every((s) => !('title' in s)));
const ld_sz = LD.mapLaunchDetail(ld_fx(/Shenzhou/));
check('uzay aracı ve mürettebat (Shenzhou 24): komutan önce, insan taşımaya uygun, Tiangong; uluslararası tanıtıcı 2026-266',
  ld_sz.spacecraft.length === 1 && ld_sz.spacecraft[0].name === 'Shenzhou 24' && ld_sz.spacecraft[0].humanRated === true && /Tiangong/.test(ld_sz.spacecraft[0].destination)
  && ld_sz.spacecraft[0].crew.length === 3 && ld_sz.spacecraft[0].crew[0].role === 'Commander' && ld_sz.designator === '2026-266' && Lc.mapLaunch(ld_fx(/Shenzhou/)).crew === 3);
check('yörünge biçimi: yer tutucular atılır, kısaltma ve Dünya dışı gök cismi; Türkçe adlar; tipik değerler iki dilde aynı sınıflar için',
  LD.orbitOf({ name: 'Unknown', abbrev: 'N/A' }) === null && LD.orbitOf(null) === null && JSON.stringify(LD.orbitOf({ name: 'Low Earth Orbit', abbrev: 'LEO', celestial_body: { name: 'Earth' } })) === '{"name":"Low Earth Orbit","abbrev":"LEO","body":null}'
  && LD.orbitOf({ name: 'Lunar Orbit', abbrev: 'LO', celestial_body: { name: 'Moon' } }).body === 'Moon' && I.ll2tr('tr', 'orbit', 'SSO', 'Sun-Synchronous Orbit') === 'Güneş eşzamanlı yörünge'
  && I.ll2tr('en', 'orbit', 'SSO', 'Sun-Synchronous Orbit') === 'Sun-Synchronous Orbit' && I.ll2tr('tr', 'orbit', 'XYZ', 'Odd Orbit') === 'Odd Orbit'
  && Object.keys(en.launch.orbitTypical).join() === Object.keys(tr.launch.orbitTypical).join() && LD.minInclination(-28.5) === 28.5 && LD.minInclination(null) === null);
check('ISO süre: gün/saat/dakika/saniye, eksi işaret, kesirli saniye; tanınmayan null',
  LD.isoDur('P47DT5H13M16S') === 4079596 && LD.isoDur('-PT38M') === -2280 && LD.isoDur('PT1H2M3.5S') === 3723.5 && LD.isoDur('P') === null && LD.isoDur('38 min') === null && LD.isoDur(null) === null);
const ld_evil = { ...ld_fx(/Cygnus/), info_urls: [{ url: 'javascript:alert(1)' }, { url: 'data:text/html,x' }, { url: '//evil.example' }, { url: 'ftp://x.example/a' }, { url: 'https://user:pw@x.example/' }, { url: 'http://ok.example/p' }, { url: ' https://ok.example/q ' }],
  vid_urls: [{ url: 'vbscript:x' }], flightclub_url: 'javascript:x', pad: { ...ld_fx(/Cygnus/).pad, map_url: 'data:x', wiki_url: 'https://en.wikipedia.org/wiki/X' }, mission: { ...ld_fx(/Cygnus/).mission, info_urls: [], vid_urls: [] } };
const ld_ev = LD.mapLaunchDetail(ld_evil);
check('bağlantılar: yalnız http(s) ve geçerli ana makine; javascript:, data:, "//", ftp:, kullanıcı adı taşıyan adres atılır',
  ld_ev.links.info.map((x) => x.url).join() === 'http://ok.example/p,https://ok.example/q' && ld_ev.links.vid.length === 0 && ld_ev.links.flightclub === null && ld_ev.pad.map === null && ld_ev.pad.wiki === 'https://en.wikipedia.org/wiki/X'
  && Lc.safeUrl('JAVASCRIPT:alert(1)') === null && Lc.safeUrl('https://') === null && Lc.safeUrl(42) === null);
const ld_GP = JSON.parse(rd('./fixtures/gp_firlatma.json')), ld_yo = LD.launchObjects(ld_GP, '2026-267');
check('fırlatmadan sonra (CelesTrak GP): Yaogan 49 01 → 3 nesne (A, B, C), yerberi/yeröte ~490–500 km, i ≈ 35°; yanlış tanıtıcıda boş',
  ld_yo.length === 3 && ld_yo.map((o) => o.cospar).join() === '2026-267A,2026-267B,2026-267C' && ld_yo.every((o) => o.perigee > 480 && o.apogee < 510 && Math.abs(o.i - 35) < 0.1 && o.regime === 'LEO')
  && LD.launchObjects(ld_GP, '2026-26').length === 0 && LD.launchObjects(ld_GP, 'x').length === 0 && LD.launchObjects(null, '2026-267').length === 0 && LD.launchObjects(ld_GP, '2026-266').length === 1);
const ld_RKD = JSON.parse(rd('../../site/data/rockets.json')), ld_f9 = ld_RKD.vehicles.find((v) => v.name === 'Falcon 9'), ld_anyTag = ld_f9.launches[ld_f9.launches.length - 1].tag;
check('GCAT: tanıtıcıyla kayıt bulunur; aracın son uçuşları yeniden eskiye, en çok n', LD.gcatByTag(ld_RKD.vehicles, ld_anyTag).vehicle === 'Falcon 9' && LD.gcatByTag(ld_RKD.vehicles, null) === null && LD.gcatByTag(ld_RKD.vehicles, '1900-001') === null
  && LD.recentFlights(ld_f9, 6).length === 6 && LD.recentFlights(ld_f9, 6)[0].date >= LD.recentFlights(ld_f9, 6)[5].date && LD.recentFlights(null).length === 0);
// tek fırlatma: listede varsa ek istek yok; yoksa tek kayıt ucu; geçersiz kimlik kaynağa sorulmaz
const ld_calls = []; const ld_multi = (map) => async (url) => { ld_calls.push(url); const r = map(url); if (r instanceof Error) throw r; return r; };
const ld_listRes = okRes({ results: ld_FX.slice(0, 5) });
const ld_inList = await Lc.getLaunch(ld_FX[0].id, { fetchImpl: ld_multi(() => ld_listRes), atBuild: false });
const ld_n1 = ld_calls.length; ld_calls.length = 0;
const ld_single = await Lc.getLaunch(ld_FX[5].id, { fetchImpl: ld_multi((u) => (/upcoming/.test(u) ? ld_listRes : okRes(ld_FX[5]))), atBuild: false });
const ld_singleUrl = ld_calls[1]; ld_calls.length = 0;
const ld_gone = await Lc.getLaunch('00000000-0000-4000-8000-000000000000', { fetchImpl: ld_multi((u) => (/upcoming/.test(u) ? ld_listRes : { ok: false, status: 404 })), atBuild: false });
const ld_limited = await Lc.getLaunch('00000000-0000-4000-8000-000000000000', { fetchImpl: ld_multi((u) => (/upcoming/.test(u) ? ld_listRes : { ok: false, status: 429 })), atBuild: false });
ld_calls.length = 0; const ld_badId = await Lc.getLaunch('../../agencies', { fetchImpl: ld_multi(() => ld_listRes), atBuild: false });
check('tek fırlatma: listede → liste isteği (1 istek); listede yok → tek kayıt ucu (mode=detailed); 404 → bulunamadı; 429 → hata (eski sayfa kalır); geçersiz kimlik → istek yok',
  ld_inList.from === 'list' && ld_n1 === 1 && ld_single.from === 'single' && ld_singleUrl === Lc.LL2_LAUNCH(ld_FX[5].id) && /mode=detailed/.test(ld_singleUrl) && ld_gone.notFound === true && /429/.test(ld_limited.error)
  && ld_badId.notFound === true && ld_calls.length === 0 && Lc.isLaunchId(ld_FX[0].id) && !Lc.isLaunchId(ld_FX[0].id.toUpperCase() + 'x'));
check('ayrıntı sayfası: /launches/[id] ISR (30 dk), liste ve ana sayfadan bağlantı; dış bağlantılar noopener, görsel yok; GP kopyası sunucuda',
  /revalidate = 1800/.test(rd('../../site/app/[lang]/launches/[id]/page.jsx')) && /getLaunch/.test(rd('../../site/app/[lang]/launches/[id]/page.jsx'))
  && /launches\/\$\{l\.id\}/.test(rd('../../site/components/LaunchBrowser.jsx')) && /launches\/\$\{launch\.id\}/.test(rd('../../site/components/NextLaunch.jsx'))
  && /rel="noopener noreferrer"/.test(rd('../../site/components/LaunchDetail.jsx')) && !/<img/.test(rd('../../site/components/LaunchDetail.jsx')) && /node:https/.test(rd('../../site/lib/launch-objects.js')));

// 5) sayfa dosyaları ve sabitler
const pages = ['app/[lang]/page.jsx', 'app/[lang]/asteroids/page.jsx', 'app/[lang]/asteroids/[id]/page.jsx', 'app/[lang]/launches/page.jsx', 'app/[lang]/sources/page.jsx'];
check('sayfalar: ana sayfa, dizin, cisim, fırlatmalar, kaynaklar', pages.every((p) => fs.existsSync(new URL(`../../site/${p}`, import.meta.url))));
const C = await import('../../site/lib/config.js'), A = await import('../../site/lib/asteroids-match.js');
check('sabitler: diller en/tr, varsayılan en; kök /en’e yönlenir', C.LANGS.join() === 'en,tr' && C.DEFAULT_LANG === 'en' && /destination: '\/en'/.test(rd('../../site/next.config.mjs')) && !!A);
check('LS19 bağlantısı: saptırma deneyi hedef parametresiyle (labtext.js LINK_KEYS)', /exp=saptirma&hedef=\$\{encodeURIComponent\(o\.des\)\}/.test(rd('../../site/lib/asteroids.js')) && /'hedef'/.test(rd('../js/labtext.js')));

// 5b) güvenilir veri: JPL SBDB belirsizlikleri ve çözüm künyesi, CAD yakın geçişleri, Sentry çarpma riski; doğrulama ve değişiklik raporu
const J = await import('../../site/lib/jpl.js');
check('veri: her cismin 1σ belirsizlikleri ve yörünge çözümü künyesi (çözüm no, tarih, gözlem sayısı, aralık)', O.every((o) => ['a', 'e', 'i', 'om', 'w', 'ma', 'q', 'ad', 'per'].every((k) => o.sigma[k] > 0)
  && o.solution.id && /^\d{4}-\d\d-\d\d$/.test(o.solution.date) && o.solution.nObs > 0 && /^\d{4}-\d\d-\d\d$/.test(o.solution.first) && /^\d{4}-\d\d-\d\d$/.test(o.solution.last) && o.solution.first <= o.solution.last));
check('veri: doğrulama her kayıtta temiz (q = a(1−e), Kepler dönemi, 3σ aralığı, sıralı geçişler, Sentry özeti)', O.every((o) => J.checkObject(o).length === 0), O.flatMap(J.checkObject).slice(0, 3).join('; '));
check('veri: her NEO için Sentry durumu (listede / çıkarılmış / yok); NEO olmayanlarda sorgu yok', O.every((o) => (o.neo ? ['listed', 'removed', 'none'].includes(o.sentry && o.sentry.status) : o.sentry === null))
  && data.cad.maxAu === 0.2 && data.cad.range.join() === '1900-01-01,2200-01-01' && Object.keys(data.apis).length === 3);
const bennu = by('bennu'), apo = by('apophis');
check('veri: Bennu Sentry listesinde (olasılık 0–1, olası çarpma > 0); Apophis listeden çıkarılmış (tarihli); Apophis 2029 geçişi 0,00026 au',
  bennu.sentry.status === 'listed' && bennu.sentry.ip > 0 && bennu.sentry.ip < 0.01 && bennu.sentry.nImp > 0 && apo.sentry.status === 'removed' && /^\d{4}-\d\d-\d\d$/.test(apo.sentry.removed)
  && apo.approaches.some((c) => c.date.startsWith('2029-04-13') && Math.abs(c.dist - 0.000254) < 2e-6));
// örnek yanıtlar (JPL belgelerindeki biçim)
const sb = { object: { des: '101955', fullname: '101955 Bennu (1999 RQ36)', prefix: null, neo: true, pha: true, orbit_class: { code: 'APO', name: 'Apollo' } },
  orbit: { epoch: '2455197.5', moid: '.00322', condition_code: '0', data_arc: '7693', orbit_id: '118', soln_date: '2021-01-07 08:23:10', producer: 'Farnocchia', n_obs_used: 554, n_del_obs_used: 58, n_dop_obs_used: 7, first_obs: '1999-09-11', last_obs: '2020-10-03', rms: '.29',
    elements: [['e', '.2037', '6.97E-11'], ['a', '1.1264', '1.97E-10'], ['q', '.89679', '2.3E-10'], ['i', '6.0349', '6.9E-9'], ['om', '2.0609', '5.6E-7'], ['w', '66.223', '6.4E-7'], ['ma', '101.70', '4.3E-8'], ['tp', '2455439.1', '1E-6'], ['per', '436.65', '1.1E-7'], ['n', '.8244', '2E-10'], ['ad', '1.3560', '2.4E-10']].map(([name, value, sigma]) => ({ name, value, sigma })) },
  phys_par: [{ name: 'H', value: '20.21' }, { name: 'diameter', value: '.484' }] };
const ms = J.mapSbdb(sb);
check('SBDB eşleme: değer ve 1σ ayrı; çözüm künyesi; ad', ms.elements.a === 1.1264 && ms.sigma.a === 1.97e-10 && ms.solution.id === '118' && ms.solution.date === '2021-01-07' && ms.solution.nDel === 58 && ms.name === 'Bennu' && ms.phys.diameter === 0.484);
const cad = J.mapCad({ fields: ['des', 'orbit_id', 'jd', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'v_inf', 't_sigma_f', 'h'],
  data: [['99942', '206', '2462240.407', '2029-Apr-13 21:46', '0.000254', '0.0002540', '0.0002541', '7.42', '5.84', '< 00:01', '19.7'], ['x', '1', '2419302.38', '1911-Sep-22 21:18', '0.0141', '0.01409', '0.0142', '6.3', '6.3', '2_09:08', '20']] });
check('CAD eşleme: TDB tarihi ISO, 3σ aralığı, zaman sırası', cad.length === 2 && cad[0].date === '1911-09-22T21:18' && cad[1].date === '2029-04-13T21:46' && cad[1].distMin === 0.000254 && cad[0].tSigma === '2_09:08' && J.mapCad({ count: 0 }).length === 0);
const sl = J.mapSentry({ summary: { ip: '5.7e-4', ps_cum: '-1.40', ps_max: '-1.58', ts_max: null, n_imp: 157, cdate: '2021-07-14 11:24:00', method: 'MC' }, data: [{ date: '2178-09-24.48' }, { date: '2290-09-25' }] });
check('Sentry eşleme: listede (özet, yıl aralığı), çıkarılmış (tarih), bulunamadı (yok), tanınmayan yanıt (null)', sl.status === 'listed' && sl.ip === 5.7e-4 && sl.tsMax === null && sl.years.join() === '2178,2290' && sl.computed === '2021-07-14'
  && J.mapSentry({ error: 'specified object removed', removed: '2021-02-21 08:22:28' }).removed === '2021-02-21' && J.mapSentry({ error: 'specified object not found' }).status === 'none' && J.mapSentry({ error: 'server busy' }) === null);
const bad = { ...bennu, id: 'x', elements: { ...bennu.elements, q: bennu.elements.q * 1.01 }, approaches: [{ ...bennu.approaches[0], distMin: bennu.approaches[0].dist * 2 }], sentry: null };
check('doğrulama: tutarsız q, 3σ dışı uzaklık ve eksik Sentry durumu yakalanır', ((e) => e.some((x) => /q ≠/.test(x)) && e.some((x) => /3σ/.test(x)) && e.some((x) => /Sentry/.test(x)))(J.checkObject(bad)));
const nxt = (f) => ({ objects: O.map((o) => (o.id === 'bennu' ? f(structuredClone(o)) : o)) });
const c1 = J.compare(data, nxt((o) => { o.solution.id = '119'; o.sentry = { status: 'removed', removed: '2027-01-01' }; return o; }));
const c2 = J.compare(data, nxt((o) => { o.elements.a *= 1.000001; return o; })), c3 = J.compare(data, { objects: O.slice(1) });
check('değişiklik raporu: yeni çözüm ve Sentry durum değişimi yazılır; aynı çözümde element kayması ve cisim kaybı yazmayı durdurur',
  c1.stop.length === 0 && c1.notes.some((x) => /119/.test(x)) && c1.notes.some((x) => /Sentry durumu listed → removed/.test(x)) && c2.stop.length === 1 && c3.stop.some((x) => /azaldı/.test(x)) && J.compare(data, data).notes.length === 0);
const sp = J.splitApproaches(apo.approaches, data.retrieved);
check('yakın geçişler: verinin alındığı güne göre geçmiş / sıradaki', sp.past.every((c) => c.date < data.retrieved) && sp.next.every((c) => c.date >= data.retrieved) && sp.past.length + sp.next.length === apo.approaches.length);
check('biçim: bilimsel gösterim ve CAD zaman belirsizliği', I.sci('tr', 1.9673e-10) === '2,0 × 10⁻¹⁰' && I.sci('en', 0.0123) === '0.012' && I.tSigma('en', '< 00:01') === '< 1 min' && I.tSigma('tr', '2_09:08') === '2 g 9 sa 8 dk' && I.tSigma('en', '13:02') === '13 h 2 min');
// fırlatma tarihinin kesinliği
const P = (n) => Lc.precisionOf(n);
check('fırlatma kesinliği: dakika/saniye kesin; saat; ay; çeyrek; yarıyıl; yıl; bilinmeyen güne yuvarlanır', P('Minute').kind === 'exact' && P('Second').kind === 'exact' && P(null).kind === 'exact' && P('Hour').kind === 'hour'
  && P('Month').kind === 'month' && P('Quarter 4').part === 4 && P('Half 1').kind === 'half' && P('Fiscal Year').kind === 'year' && P('Morning/Afternoon').kind === 'day' && P('Sometime').kind === 'day');
check('fırlatma tarihi kaynağın kesinliğinde yazılır (ay → "December 2026", çeyrek → "Q4 2026"; saat → "~13:00")', I.netLabel('en', '2026-12-31T00:00:00Z', P('Month')) === 'December 2026' && I.netLabel('tr', '2026-12-31T00:00:00Z', P('Month')) === 'Aralık 2026'
  && I.netLabel('en', '2026-12-31T00:00:00Z', P('Quarter 4')) === 'Q4 2026' && I.netLabel('en', '2026-11-27T13:00:00Z', P('Hour')) === '27 Nov 2026, ~13:00 UTC' && I.netLabel('en', '2026-11-27T00:05:00Z', P('Minute')) === '27 Nov 2026, 00:05 UTC');
const LP = [{ net: '2026-11-30T00:00:00Z', status: { abbrev: 'TBD' }, precision: P('Month') }, { net: '2026-12-01T01:45:00Z', status: { abbrev: 'Go' }, precision: P('Hour') }];
check('sıradaki fırlatma: tarihi yalnız ay düzeyinde bilinen atlanır (geri sayım yalnız saati bilinene)', Lc.nextLaunch(LP, now) === LP[1] && Lc.mapLaunch({ ...raw, net_precision: { name: 'Month' } }).precision.kind === 'month');

// 5c) uydular: CelesTrak GP + GCAT; türetilmiş yörünge, doğrulama, model paketi
const Sa = await import('../../site/lib/sat.js'), SD = JSON.parse(rd('../../site/data/satellites.json')), SO = SD.objects;
const ufiles = man.paketler.uydu.dosyalar;
check('uydu verisi: ≥ 30 uydu, NORAD tekil, her kayıt doğrulamadan geçer (GP elementleri, yerberi > 80 km, epok < 30 gün, GCAT, model)',
  SO.length >= 30 && new Set(SO.map((o) => o.id)).size === SO.length && SO.every((o) => Sa.checkSat(o, SD.retrieved).length === 0), SO.flatMap((o) => Sa.checkSat(o, SD.retrieved)).slice(0, 3).join('; '));
check('uydu verisi: her model "uydu" sürüm paketinde; temsilî ticari GEO modeli kullanılmaz; kaynak ve sürüm bilgisi yazılı', SO.every((o) => ufiles[`web/models/sats/${o.model.key}.glb.gz`]) && !SO.some((o) => o.model.key === 'ssl1300')
  && /CelesTrak/.test(SD.gp.source) && /GCAT/.test(SD.gcat.source) && /CC BY 4\.0/.test(SD.gcat.source));
const iss = SO.find((o) => o.id === '25544');
check('ISS: alçak yörünge, 51,6°, 380–450 km, ~92–94 dk; GCAT kaydının yalnız Zarya olduğu sayfada yazılı', iss && iss.derived.regime === 'LEO' && Math.abs(iss.elements.i - 51.6) < 0.2 && iss.derived.perigee > 380 && iss.derived.apogee < 450
  && iss.derived.period > 91 && iss.derived.period < 95 && iss.gcat.name === 'Zarya' && /Zarya/.test(iss.note.en) && /Zarya/.test(iss.note.tr));
const gpS = Sa.mapGp({ OBJECT_NAME: 'TEST', OBJECT_ID: '2017-073A', NORAD_CAT_ID: 43013, EPOCH: '2026-11-26T04:04:59.467872', MEAN_MOTION: 14.19552, ECCENTRICITY: 0.0001, INCLINATION: 98.72, RA_OF_ASC_NODE: 1, ARG_OF_PERICENTER: 2, MEAN_ANOMALY: 3, BSTAR: 1e-5 });
const geo = Sa.mapGp({ OBJECT_NAME: 'G', OBJECT_ID: '2016-071A', NORAD_CAT_ID: 41866, EPOCH: '2026-11-26T00:00:00', MEAN_MOTION: 1.00271, ECCENTRICITY: 0.0002, INCLINATION: 0.05 });
check('GP türetme: yarı büyük eksen Kepler yasasıyla; 98,7° ve ~824 km Güneş eşzamanlı (J2 düğüm kayması ≈ +0,986 °/gün); 1 tur/yıldız günü GEO',
  Math.abs(gpS.derived.a - 7205) < 2 && gpS.derived.sso && Math.abs(gpS.derived.nodal - 0.9856) < 0.05 && gpS.derived.regime === 'LEO' && geo.derived.regime === 'GEO' && Math.abs(geo.derived.apogee - 35786) < 40
  && gpS.epoch === '2026-11-26T04:04:59.467Z');
check('yörünge bölgesi: HEO (e ≥ 0,25), MEO, yüksek', Sa.regimeOf(1000, 70000, 0.8, 2000) === 'HEO' && Sa.regimeOf(20000, 20300, 0.005, 718) === 'MEO' && Sa.regimeOf(40000, 41000, 0.01, 1700) === 'HIGH');
check('GCAT tarihi ve TSV: saatli, saatsiz, belirsiz (?); başlık ve yorum satırları', Sa.gcatDate('1990 Apr 24 1233:52').iso === '1990-04-24' && Sa.gcatDate('1990 Apr 24 1233:52').time === '12:33' && Sa.gcatDate('2017 Nov 18').time === null
  && Sa.gcatDate('1998 Nov 20 0649?').uncertain && Sa.gcatDate('-') === null && Sa.parseTsv('#A\tB\n# yorum\n1\t x \n').length === 1 && Sa.parseTsv('#A\tB\n1\t x \n')[0].B === 'x');
const tbl = { launches: new Map([['2017-073', { Launch_Date: '2017 Nov 18 0947:36', LV_Type: 'Delta 7920-10C', Flight: 'D378', Launch_Site: 'V', Launch_Pad: 'SLC2W' }]]),
  orgs: new Map([['GSFC', { Name: 'NASA Goddard Space Flight Center', ShortName: 'GSFC' }], ['NOAA', { Name: 'National Oceanic and Atmospheric Administration', ShortName: 'NOAA' }]]), sites: new Map([['V', { Name: 'Vandenberg AFB, California', ShortName: 'Vandenberg' }]]) };
const gc = Sa.mapGcat({ JCAT: 'S43013', Satcat: '43013', Launch_Tag: '2017-073', Name: 'NOAA-20', Owner: 'GSFC/NOAA', Manufacturer: 'BALL', Mass: '   2200 ', DryMass: '-', Length: '  3.6 ' }, tbl);
check('GCAT eşleme: kurum adları (kısa ve tam), bilinmeyen kod olduğu gibi, "-" boş; fırlatma tablosundan araç ve yer', gc.owner.join() === 'NASA Goddard Space Flight Center,National Oceanic and Atmospheric Administration' && gc.ownerShort.join('/') === 'GSFC/NOAA'
  && gc.manufacturer.join() === 'BALL' && gc.mass === 2200 && gc.dryMass === null && gc.length === 3.6 && gc.launch.vehicle === 'Delta 7920-10C' && gc.launch.siteShort === 'Vandenberg' && gc.launch.date.time === '09:47');
const lost = Sa.compareSats(SD, { objects: SO.slice(0, Math.floor(SO.length * 0.6)) }), moved = Sa.compareSats(SD, { objects: SO.map((o) => (o.id === '25544' ? { ...o, derived: { ...o.derived, perigee: o.derived.perigee + 40 } } : o)) });
check('uydu karşılaştırma: toplu kayıp yazmayı durdurur; büyük yükseklik değişimi (manevra) rapora yazılır', lost.stop.length === 1 && moved.stop.length === 0 && moved.notes.some((x) => /yükseklik/.test(x)));
check('uydu sayfaları ve site haritası; haftalık iş akışı uyduları da yeniler', fs.existsSync(new URL('../../site/app/[lang]/satellites/[id]/page.jsx', import.meta.url)) && /SATS\.map/.test(rd('../../site/app/sitemap.js'))
  && /uydular\.mjs/.test(rd('../../.github/workflows/site-veri.yml')) && /satellites\.json/.test(rd('../../.github/workflows/site-veri.yml')) && /'uydu'/.test(rd('../../site/scripts/modeller.mjs')));

// 5d) değişken şemaları: her satır etiketi düğme; şema ve açıklama iki dilde
const VZsrc = rd('../../site/components/viz.jsx'), VTsrc = rd('../../site/components/VarTip.jsx');
const kinds = ['a', 'e', 'i', 'om', 'w', 'ma', 'q', 'Q', 'per', 'moid', 'H', 'D', 'rot', 'alb', 'U', 'arc', 'ip', 'ps', 'ts', 'sa', 'hp', 'ha', 'sper', 'n', 'bstar', 'nodal', 'mass', 'dims', 'net'];
check('şemalar: her değişkenin iki dilde açıklaması var', kinds.every((k) => en.viz[k] && tr.viz[k]) && en.viz.net('month') !== tr.viz.net('month') && /Earth’s centre/.test(en.viz.e('earth')));
check('şemalar: SVG aria-hidden, kutunun içinde (overflow hidden), anlamı açıklama taşır (aria-describedby); Esc kapatır, odak döner; tek açık',
  /aria-hidden="true"/.test(VZsrc) && /overflow="hidden"/.test(VZsrc) && /aria-describedby/.test(VTsrc) && /Escape/.test(VTsrc) && /focus\(\)/.test(VTsrc) && /closeOther/.test(VTsrc) && !/\bref=/.test(rd('../../site/app/[lang]/satellites/[id]/page.jsx')));
check('şemalar: asteroit, uydu ve fırlatma sayfalarına bağlı', /withViz\(orbit, vz\)/.test(rd('../../site/components/AsteroidRecord.jsx')) && /withViz\(derived, vz\)/.test(rd('../../site/app/[lang]/satellites/[id]/page.jsx'))
  && /<Window kind=/.test(rd('../../site/components/NextLaunch.jsx')) && /prefers-reduced-motion[\s\S]*vt__pop\[data-open\] \{ animation: none; \}/.test(rd('../../site/app/globals.css')));

// 5e) süzgeçler ve site araması
const Se = await import('../../site/lib/search.js');
check('arama: Türkçe/İngilizce harf ve aksan duyarsız; boşluk, tire, parantez yok sayılır', Se.norm('İTOKAWA') === 'itokawa' && Se.norm('Güneş eşzamanlı') === 'guneseszamanli' && Se.norm('1998 KY26') === Se.norm('1998ky26') && Se.norm('(2008 EV5)') === '2008ev5' && Se.norm('Sentinel-6') === 'sentinel6');
const rk = Se.rank([{ n: 'Ryugu' }, { n: 'Bennu' }, { n: 'Didymos' }, { n: 'Ultima' }], 'u', (o) => [o.n]).map((o) => o.n);
check('arama: başlayan önce, sonra içeren; eşleşmeyen yok; boş sorgu tüm liste', rk.join() === 'Ultima,Ryugu,Bennu' && Se.rank([1, 2], '', () => ['x']).length === 2);
const srt = Se.sortBy([{ v: 3 }, { v: null }, { v: 1 }, { v: 2 }], (o) => o.v, 'desc').map((o) => o.v);
check('sıralama: azalan/artan; değeri olmayan her yönde sonda', srt.join() === '3,2,1,' && Se.sortBy([{ v: 'b' }, { v: 'a' }], (o) => o.v).map((o) => o.v).join() === 'a,b');
const D0 = { q: '', cls: '', neo: false, sort: 'num', dir: 'asc' };
check('süzgeç durumu adreste: yalnız varsayılandan farklılar yazılır, geri okunur', Se.writeParams({ ...D0, cls: 'APO', neo: true }, D0) === '?cls=APO&neo=1' && Se.writeParams(D0, D0) === ''
  && JSON.stringify(Se.readParams('?cls=APO&neo=1&x=9', D0)) === JSON.stringify({ ...D0, cls: 'APO', neo: true }));
check('süzgeç ve arama metinleri iki dilde; sayfalar ve /search.json bağlı', !!en.flt.ph.lch && !!tr.flt.ph.lch && en.search.launches('x') !== tr.search.launches('x')
  && /AsteroidBrowser/.test(rd('../../site/app/[lang]/asteroids/page.jsx')) && /SatBrowser/.test(rd('../../site/app/[lang]/satellites/page.jsx')) && /LaunchBrowser/.test(rd('../../site/app/[lang]/launches/page.jsx'))
  && /SiteSearch/.test(rd('../../site/components/Masthead.jsx')) && /force-static/.test(rd('../../site/app/search.json/route.js')));

// 5f) roketler: GCAT ölçüleri, kademeler, fırlatma kaydı; LL2 adı eşleme; ölçülerden 3B yerleşim
const RD = JSON.parse(rd('../../site/data/rockets.json')), RV = RD.vehicles, RM = await import('../../site/lib/rockets-match.js'), R3 = await import('../../site/lib/rocket3d.js');
const f9 = RV.find((v) => v.name === 'Falcon 9'), fh = RV.find((v) => v.name === 'Falcon Heavy'), cz6a = RV.find((v) => v.name === 'Chang Zheng 6A');
check('roket verisi: ≥ 60 araç, adresler tekil; her birinin boyu, çapı, kademesi ve en az bir yörünge fırlatması var; kaynak CC BY 4.0', RV.length >= 60 && new Set(RV.map((v) => v.slug)).size === RV.length
  && RV.every((v) => v.spec.length > 0 && v.spec.diameter > 0 && v.spec.stages.some((x) => /^[1-9]$/.test(x.no)) && v.stats.total === v.launches.length && v.stats.total > 0) && /CC BY 4\.0/.test(RD.source));
check('roket kaydı: başarılı + başarısız ≤ toplam; tarihler sıralı; Falcon 9 ≥ 400 fırlatma, ilk 2010', RV.every((v) => v.stats.success + v.stats.failure <= v.stats.total && v.launches.every((l, k, a) => !k || a[k - 1].date <= l.date))
  && f9.stats.total >= 400 && f9.stats.first.startsWith('2010') && f9.slug === 'falcon9');
const names = RV.map((v) => v.name);
check('LL2 adı → GCAT: Long March → Chang Zheng, Kinetica → Lijian, Ceres → Gushenxing, blok eki atılır; tanınmayan null', RM.matchRocket('Long March 6A', names) === 'Chang Zheng 6A' && RM.matchRocket('Kinetica 1', names) === 'Lijian-1'
  && RM.matchRocket('Falcon 9 Block 5', names) === 'Falcon 9' && RM.matchRocket('Vega-C', names) === 'Vega C' && RM.matchRocket('Soyuz 2.1b', names) === 'Soyuz-2-1B' && RM.matchRocket('Ceres-1', names) === 'Gushenxing 1' && RM.matchRocket('Mir', names) === null);
const lf9 = R3.rocketLayout(f9.spec), lfh = R3.rocketLayout(fh.spec), lcz = R3.rocketLayout(cz6a.spec);
check('3B yerleşim: kademeler istiflenir, toplam boy aracın boyuna yakın; Falcon Heavy 2, Chang Zheng 6A 4 yan itici; kaporta en üstte', Math.abs(lf9.height - f9.spec.length) / f9.spec.length < 0.1
  && lfh.boosters.length === 2 && lcz.boosters.length === 4 && lf9.segs[lf9.segs.length - 1].kind === 'fairing' && lf9.segs.filter((x) => x.kind === 'stage').length === 2 && lf9.boosters.length === 0);
// 5g) tarihçe: keşif, gözlem, yakın geçiş, Sentry, görev olayları; tarih sırası; gelecek işaretli
const Hs = await import('../../site/lib/history.js'), EVJ = JSON.parse(rd('../../site/data/events.json')), MJ = JSON.parse(rd('../../site/data/missions.json'));
const hb = Hs.asteroidEvents(bennu, 'en', data.retrieved, MJ), hs = Hs.satEvents(SO.find((o) => o.id === '20580'), 'tr', SD.retrieved, EVJ);
check('tarihçe (Bennu): LINEAR keşfi, OSIRIS-REx olayları (fırlatma ve dört olay), Sentry; sıralı; gelecekteki yakın geçişler işaretli', hb.some((e) => e.kind === 'disc' && /LINEAR/.test(e.text)) && hb.filter((e) => e.mission === 'OSIRIS-REx').length === 5 && hb.some((e) => e.kind === 'launch' && e.date === '2016-09-08')
  && hb.some((e) => e.kind === 'risk') && hb.every((e, k, a) => !k || a[k - 1].date <= e.date) && hb.filter((e) => e.future).every((e) => e.date > data.retrieved) && hb.some((e) => e.future));
check('tarihçe (Hubble): fırlatma (GCAT), açılış, beş bakım görevi, son element kümesi; iki dilde', hs.some((e) => e.kind === 'launch' && /Space Shuttle/.test(e.text)) && hs.filter((e) => e.kind === 'service').length === 5 && hs.some((e) => e.src === 'CelesTrak GP')
  && Hs.satEvents(SO.find((o) => o.id === '20580'), 'en', SD.retrieved, EVJ).some((e) => /servicing/.test(e.text)));
check('uydu görev olayları dosyası: her uydu kimliği veride var; tarih ISO; iki dilde metin; asteroit görevleri ayrı dosyada', !EVJ.asteroids && Object.keys(EVJ.satellites).every((k) => SO.some((o) => o.id === k))
  && Object.values(EVJ.satellites).flat().every((e) => /^\d{4}-\d\d-\d\d$/.test(e.date) && e.en && e.tr && e.mission));
// 5g2) asteroitlere giden uzay araçları (data/missions.json): hedef JPL gösterimiyle; şekil modelli ve katalog cisimleri aynı veriyi kullanır
const MS = await import('../../site/lib/missions.js'), TODAY = '2026-11-27';
check('görev verisi: kimlik tekil, künye tam, tarih ISO ve fırlatmadan sonra, iki dilde metin, rol bilinen, adres https', MS.checkMissions(MJ).length === 0 && MJ.missions.length >= 18);
check('görev verisi: önceki elle derlenmiş olayların hepsi taşındı (14 şekil modelli cisim)', ['gaspra', 'eros', 'itokawa', 'steins', 'lutetia', 'vesta', 'ceres', 'toutatis', 'ryugu', 'bennu', 'didymos', 'psyche', 'apophis', '1998ky26'].every((id) => MS.missionsFor(O.find((o) => o.id === id).des, MJ, TODAY).length));
const dy = MS.missionsFor('65803', MJ, TODAY), ap = MS.missionsFor('99942', MJ, TODAY), ida = MS.missionsFor('243', MJ, TODAY);
check('görev durumu: Didymos — DART tamamlandı, Hera sürüyor; Apophis planlanıyor; Ida (katalog cismi) Galileo, en yakın 2400 km', dy.map((v) => `${v.mission.id}:${v.status}`).join() === 'dart:done,hera:active'
  && ap.length === 1 && ap[0].status === 'planned' && ida.length === 1 && ida[0].mission.id === 'galileo' && ida[0].closest === 2400 && MS.missionsFor('433', MJ, TODAY)[0].first === '1998-12-23');
const vix = MS.visitIndex(MJ, TODAY);
check('ziyaret dizini: her cisim bir kez, adlı; en kapsamlı iş (Bennu örnek, Didymos çarpma); planlananlar sonda', vix.length === new Set(vix.map((v) => v.des)).size && vix.every((v) => v.name && v.role)
  && vix.find((v) => v.des === "101955").role === "sample" && vix.find((v) => v.des === "65803").role === "impact" && vix.findIndex((v) => v.status === "planned") > vix.map((v) => v.status).lastIndexOf("active"));
const hIda = Hs.asteroidEvents({ des: '243', approaches: [], solution: {} }, 'tr', TODAY, MJ);
check('katalog cismi tarihçesi: Ida için Galileo geçişi (Türkçe metin, görev adı)', hIda.length === 1 && hIda[0].mission === 'Galileo' && /Dactyl/.test(hIda[0].text) && hIda[0].kind === 'flyby');
check('keşif kaydı (SBDB): 33 cismin en az 30’unda tarih, yer ve keşfeden', O.filter((o) => o.discovery && /^\d{4}-\d\d-\d\d$/.test(o.discovery.date) && o.discovery.location && o.discovery.who).length >= 30);
check('roket ve tarihçe sayfaları bağlı; haftalık iş akışı roketleri de yeniler', fs.existsSync(new URL('../../site/app/[lang]/rockets/[slug]/page.jsx', import.meta.url)) && /<Timeline/.test(rd('../../site/components/AsteroidRecord.jsx'))
  && /<Timeline/.test(rd('../../site/app/[lang]/satellites/[id]/page.jsx')) && /roketler\.mjs/.test(rd('../../.github/workflows/site-veri.yml')) && /rocketForLL2/.test(rd('../../site/components/NextLaunch.jsx')) && !!en.rk && !!tr.hist);

// 5h) tüm asteroitler kataloğu (JPL canlı): sorgu yalnız beyaz listeden; adres dönüşümü; istekle üretilen sayfa
const SL = await import('../../site/lib/sbdb-live.js');
const lq = new URL(SL.listQuery({ group: 'pha', cls: 'ATE', h: '20', d: true, sort: 'H', dir: 'desc', page: 2 })), lp = lq.searchParams;
check('katalog sorgusu: grup, sınıf, parlaklık, çap, sıralama ve sayfa JPL parametrelerine doğru çevrilir; sıralanan alan boş olanlar dışarıda',
  lq.host === 'ssd-api.jpl.nasa.gov' && lp.get('sb-group') === 'pha' && lp.get('sb-class') === 'ATE' && lp.get('sort') === '-H' && lp.get('limit-from') === '100' && lp.get('limit') === '50'
  && JSON.parse(lp.get('sb-cdata')).AND.join() === 'H|LE|20,diameter|DF,H|DF');
const badQ = new URL(SL.listQuery({ group: 'x"]}', cls: 'XYZ', h: '1;drop', d: false, sort: 'evil', dir: 'up', page: -5 })).searchParams;
check('katalog sorgusu: tanınmayan grup, sınıf, sıralama ve sayı yok sayılır (kullanıcı metni sorguya girmez); sayfa sınırlı',
  !badQ.has("sb-group") && !badQ.has("sb-class") && !badQ.has("sb-cdata") && badQ.get("sort") === "spkid" && badQ.get("limit-from") === "0" && new URL(SL.listQuery({ page: 99999999 })).searchParams.get('limit-from') === String(40000 * 50));
check('katalog: kısmen bilinen ilk gözlem tarihi yalnız bilinen kısmıyla ("2019-??-??" → 2019)', SL.partialDate('2019-??-??') === '2019' && SL.partialDate('2019-5-??') === '2019-05' && SL.partialDate('1995-01-05') === '1995-01-05' && SL.partialDate('') === null && SL.partialDate(null) === null);
const sq = SL.statQueries();
check('katalog sayıları: sınıf başına ve gruplar için sayım sorguları (limit 1); son bilinen değerlerin sınıf toplamı toplama eşit', Object.values(sq).every((u) => new URL(u).searchParams.get('limit') === '1')
  && new URL(sq['cls.APO']).searchParams.get('sb-class') === 'APO' && JSON.parse(new URL(sq.neo140m).searchParams.get('sb-cdata')).AND[0] === 'H|LE|22'
  && Object.values(SL.KNOWN_STATS.cls).reduce((a, b) => a + b, 0) === SL.KNOWN_STATS.total && SL.STAT_CLASSES.every((c) => en.pr.defs[c] && tr.pr.defs[c] && tr.cls[c]));
check('katalog adresi: gösterim ↔ adres (boşluk ↔ alt çizgi); geçersiz gösterim reddedilir', SL.desToSlug('2004 MN4') === '2004_MN4' && SL.slugToDes('3524_P-L') === '3524 P-L' && SL.slugToDes('2024%20YR4') === '2024 YR4'
  && SL.validDes('2024 YR4') && SL.validDes('99942') && !SL.validDes('../etc') && !SL.validDes('a'.repeat(40)) && !SL.validDes('x" OR 1'));
check('katalog sayfaları: /asteroids/all, /sb/[des] (istekle, bir gün önbellek; 33 cisim zengin sayfaya yönlenir), /api/sb; düzen alt sayfaları kilitlemez',
  /revalidate = 86400/.test(rd('../../site/app/[lang]/sb/[des]/page.jsx')) && /redirect\(/.test(rd('../../site/app/[lang]/sb/[des]/page.jsx')) && /dynamicParams = true/.test(rd('../../site/app/[lang]/sb/[des]/page.jsx'))
  && !/export const dynamicParams = false/.test(rd('../../site/app/[lang]/layout.jsx')) && /liveFind/.test(rd('../../site/app/api/sb/route.js')) && fs.existsSync(new URL('../../site/app/[lang]/error.jsx', import.meta.url))
  && /AsteroidRecord/.test(rd('../../site/app/[lang]/asteroids/[id]/page.jsx')) && !!en.cat && !!tr.cat && /api\/sb\?find=/.test(rd('../../site/components/SiteSearch.jsx')));

// 5i) tüm uydular kataloğu: GCAT özeti (haftalık), GP canlı; sorgu yalnız beyaz listeden; istekle üretilen sayfa
const SC = await import('../../site/lib/satcat.js'), CATJ = JSON.parse(rd('../../site/data/satcat.json'));
check('uydu kataloğu özeti: ≥ 10 000 uydu, doğrulamadan geçer (sütunlar, tekil NORAD, GCAT eşleşmesi ≥ %85, fırlatma tablosu); her modelli uydu özette; kaynak yazılı',
  CATJ.sats.length >= 10000 && SC.checkCat(CATJ, CATJ).length === 0 && SO.every((o) => CATJ.sats.some((r) => r[0] === o.norad)) && /GCAT/.test(CATJ.gcat.source) && /CC BY 4\.0/.test(CATJ.gcat.source) && /active/.test(CATJ.gp.source),
  SC.checkCat(CATJ, CATJ).join('; '));
const shrunk = { ...CATJ, sats: CATJ.sats.slice(0, Math.floor(CATJ.sats.length * 0.6)), gp: { ...CATJ.gp } };
check('uydu kataloğu özeti: toplu kayıp ve düşük eşleşme yazmayı durdurur; bozuk satır yakalanır', SC.checkCat(shrunk, CATJ).some((x) => /birden çıktı/.test(x)) && SC.checkCat(shrunk, null).some((x) => /eşleşmesi düşük/.test(x))
  && SC.checkCat({ ...CATJ, sats: [...CATJ.sats.slice(1), [-1, 'x']] }, CATJ).some((x) => /geçersiz satır/.test(x)));
const gpFake = (k, name, n, e, i, w = 0) => ({ OBJECT_NAME: name, OBJECT_ID: `20${String(k).slice(-2)}-001A`, NORAD_CAT_ID: k, EPOCH: '2026-11-26T00:00:00.000000', MEAN_MOTION: n, ECCENTRICITY: e, INCLINATION: i, RA_OF_ASC_NODE: 10, ARG_OF_PERICENTER: w, MEAN_ANOMALY: 0, BSTAR: 1e-4, MEAN_MOTION_DOT: 0, REV_AT_EPOCH: 1 });
const ixGp = [{ ...gpFake(25544, 'ISS (ZARYA)', 15.5, 0.0004, 51.63), OBJECT_ID: '1998-067A' }, ...CATJ.sats.slice(0, 40).map((r, j) => gpFake(r[0], `TEST-${j}`, 14 + j / 20, 0.001, 53)), gpFake(41866, 'GOES 16', 1.0027, 0.0002, 0.05), gpFake(999990, 'NO GCAT', 15, 0.001, 97.5), gpFake(999991, 'BAD', 0, 1.5, 10)];
const IX = SC.buildIndex(ixGp, CATJ, new Set(['25544']));
const qq = (o) => SC.queryCat(IX, SC.parseCatQuery((k) => o[k]));
check('uydu kataloğu dizini: GP + GCAT birleşir; geçersiz GP atlanır; GCAT kaydı olmayan uydu da listede; modelli uydu işaretli', IX.rows.length === ixGp.length - 1 && IX.rows.find((r) => r.k === 25544).M && !IX.rows.find((r) => r.k === 41866).M
  && IX.rows.find((r) => r.k === 999990).s === null && IX.rows.find((r) => r.k === 41866).r === 'GEO' && IX.rows.find((r) => r.k === 25544).s === 'US');
check('uydu kataloğu sorgusu: tam NORAD önce, ad/COSPAR harf duyarsız, bölge ve ülke süzgeci, sıralamada boş değer sonda, sayfa sınırlı', qq({ q: '25544' }).rows[0].k === 25544 && qq({ q: 'zarya' }).rows[0].k === 25544 && qq({ q: '1998-067a' }).rows[0].k === 25544
  && qq({ regime: 'GEO' }).rows.every((r) => r.r === 'GEO') && qq({ state: 'US' }).rows.every((r) => r.s === 'US') && qq({ state: 'US' }).count >= 1 && qq({ sort: 'mass', dir: 'desc' }).rows.at(-1).m === null && qq({ sort: 'mass', dir: 'asc' }).rows.at(-1).m === null
  && qq({ model: '1' }).count === 1 && qq({ page: '999' }).page === 0 && qq({}).total === IX.rows.length && !('key' in qq({}).rows[0]) && !('oc' in qq({}).rows[0]));
const badS = SC.parseCatQuery((k) => ({ regime: 'LEO"]', sort: 'constructor', dir: 'up', page: '-3', state: '<script>', owner: 'a'.repeat(40), q: 'x'.repeat(90) })[k]);
check('uydu kataloğu sorgusu: tanınmayan bölge, sıralama, yön, kod ve sayfa yok sayılır; metin 40 karakterle sınırlı', badS.regime === '' && badS.sort === 'norad' && badS.dir === 'asc' && badS.page === 0 && badS.state === '' && badS.owner === '' && badS.q.length === 40);
const FC = SC.catFacets(IX), rec = SC.satRecordOf(IX, '25544');
check('uydu kataloğu: süzgeç seçenekleri sayılı; site araması en çok 8; tek uydu kaydı zengin sayfalarla aynı biçimde (GCAT, tarihçe); etkin kümede olmayan null',
  FC.regimes.some(([k, n]) => k === 'LEO' && n > 30) && FC.states.some(([c, l]) => c === 'US' && l === 'USA') && SC.findCat(IX, 'test').length === 8 && SC.findCat(IX, '').length === 0
  && rec.gcat.name === 'Zarya' && rec.gcat.launch.vehicle && Sa.checkSat({ ...rec, model: { key: 'x' } }, '2026-11-27').length === 0 && SC.satRecordOf(IX, '1') === null && SC.satRecordOf(IX, 'abc') === null
  && Hs.satEvents(rec, 'tr', '2026-11-27', EVJ).some((e) => e.kind === 'launch') && SC.progGroup('Starlink 2MO S1') === 'Starlink' && SC.progGroup('Flock-4') === 'Flock' && SC.progGroup(null) === null);
const satPg = rd('../../site/app/[lang]/sat/[norad]/page.jsx'), scb = rd('../../site/components/SatCatalogBrowser.jsx');
check('uydu kataloğu sayfaları: /satellites/all, /sat/[norad] (istekle, önbellekli; modelli uydu zengin sayfaya yönlenir; geçersiz numara 404), /api/sat; tarayıcıya özet gitmez',
  /revalidate = \d+/.test(satPg) && /dynamicParams = true/.test(satPg) && /redirect\(`\/\$\{lang\}\/satellites\//.test(satPg) && /notFound\(\)/.test(satPg) && /SatOrbitPlan/.test(satPg) && /<Timeline/.test(satPg)
  && fs.existsSync(new URL('../../site/app/[lang]/satellites/all/page.jsx', import.meta.url)) && /parseCatQuery/.test(rd('../../site/lib/satcat-live.js')) && /liveCatalog/.test(rd('../../site/app/api/sat/route.js'))
  && /^'use client'/.test(scb) && /\/api\/sat\?/.test(scb) && !/satcat(-live|\.json)/.test(scb) && /api\/sat\?find=/.test(rd('../../site/components/SiteSearch.jsx')) && /satellites\/all/.test(rd('../../site/app/sitemap.js'))
  && /satellites\/all/.test(rd('../../site/app/[lang]/satellites/page.jsx')) && /satcat\.json/.test(rd('../../.github/workflows/site-veri.yml')) && /buildCat/.test(rd('../../site/scripts/uydular.mjs')) && !!en.satcat && !!tr.satcat);

// 6) yayın altyapısı: meta veri, güvenlik başlıkları, Vercel ayarı, 404, yazı tipi
const S = await import('../../site/lib/seo.js');
const alt = S.alternates('tr', '/asteroids/bennu'), pm = S.pageMeta('en', '/launches', { title: 'Upcoming launches', description: 'd' });
check('meta: kanonik adres, her dilde hreflang ve x-default (İngilizce); Open Graph dil ve adres', alt.canonical === '/tr/asteroids/bennu' && alt.languages.en === '/en/asteroids/bennu' && alt.languages['x-default'] === '/en/asteroids/bennu'
  && pm.openGraph.locale === 'en_GB' && pm.openGraph.alternateLocale.join() === 'tr_TR' && pm.openGraph.url === '/en/launches' && pm.title === 'Upcoming launches');
process.env.NODE_ENV = 'production';
const N = await import('../../site/next.config.mjs'), H = Object.fromEntries(N.SECURITY_HEADERS.map((h) => [h.key, h.value]));
const heads = await N.default.headers(), csp = H['Content-Security-Policy'];
check('güvenlik başlıkları her yanıtta: CSP, nosniff, çerçeveleme yok, izinler kapalı', heads[0].source === '/:path*' && heads[0].headers === N.SECURITY_HEADERS
  && H['X-Content-Type-Options'] === 'nosniff' && H['X-Frame-Options'] === 'DENY' && /camera=\(\)/.test(H['Permissions-Policy']) && !!H['Referrer-Policy']);
check('CSP: yalnız aynı kaynak; eval yok (yalnız WebAssembly), nesne ve çerçeve yok', /default-src 'self'/.test(csp) && /'wasm-unsafe-eval'/.test(csp) && !/'unsafe-eval'/.test(csp)
  && /object-src 'none'/.test(csp) && /frame-ancestors 'none'/.test(csp) && /img-src[^;]*blob:/.test(csp) && /connect-src[^;]*blob:/.test(csp) && !/https?:\/\//.test(csp));
check('404: eşleşmeyen her adreste sitenin kendi sayfası (global-not-found açık)', N.default.experimental.globalNotFound === true && fs.existsSync(new URL('../../site/app/global-not-found.jsx', import.meta.url)) && fs.existsSync(new URL('../../site/app/[lang]/not-found.jsx', import.meta.url)));
const V = JSON.parse(rd('../../site/vercel.json'));
check('Vercel (kök dizin site): Next.js, kilit dosyasıyla kurulum; site ya da varlık listesi son yayından beri değişmediyse derleme atlanır (ilk yayın her zaman derlenir); data dalı yayınlanmaz',
  V.framework === 'nextjs' && V.installCommand === 'npm ci' && /^\[ -n "\$VERCEL_GIT_PREVIOUS_SHA" \] && git diff --quiet "\$VERCEL_GIT_PREVIOUS_SHA" HEAD -- \. \.\.\/varliklar\.json$/.test(V.ignoreCommand) && V.git.deploymentEnabled.data === false);
const css = rd('../../site/app/globals.css'), pj = JSON.parse(rd('../../site/package.json'));
check('yazı tipi: --f-sans/--f-mono yalnız next/font tanımlar (globals.css ezmez); Node 22 (CI ile aynı; Vercel yeni ana sürüme kendiliğinden geçmez)', !/--f-(sans|mono)\s*:/.test(css) && pj.engines.node === '22.x' && pj.scripts.prebuild === 'node scripts/modeller.mjs');
const vi = rd('../../.vercelignore').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
check('.vercelignore (iki projeye de uygulanır): klasör kuralları köke bağlı, site/ dosyaları silinmez', ['/scripts/', '/docs/', '/kernels/', '/pylib/', '/renders/'].every((r) => vi.includes(r))
  && !vi.some((l) => /^(scripts|docs|app|lib|components|data|public)\/?$/.test(l) || /^site(\/|$)/.test(l)));
check('sitemap ve robots: her sayfa her dilde; önizleme adreslerinde tarama kapalı', /OBJECTS\.map/.test(rd('../../site/app/sitemap.js')) && /LANGS\.map/.test(rd('../../site/app/sitemap.js')) && /VERCEL_ENV/.test(rd('../../site/app/robots.js')));

if (fail) { console.log(`\n${fail} hata`); process.exit(1); }
// 5i) fırlatma üsleri (data/sites.json, GCAT) ve konumun yakıt bedeli (lib/launchsite.js)
const LSD = JSON.parse(rd('../../site/data/sites.json')), LS = await import('../../site/lib/launchsite.js');
const lsBy = Object.fromEntries(LSD.sites.map((x) => [x.slug, x]));
check('üsler: tekil adres, koordinat, ülke kodu; toplam = üslerin toplamı ≥ 7000; Baykonur KZ, Plesetsk ve Canaveral en çok', new Set(LSD.sites.map((x) => x.slug)).size === LSD.sites.length
  && LSD.sites.every((x) => Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180 && /^[A-Z]{2}$/.test(x.cc)) && LSD.total === LSD.sites.reduce((n, x) => n + x.stats.total, 0) && LSD.total >= 7000
  && lsBy.baykonur.cc === 'KZ' && LSD.sites.slice(0, 3).map((x) => x.slug).sort().join() === 'baykonur,canaveral,plesetsk');
check('üsler: her üste fırlatmalar tarih sırasında, sonuç S/F/E/U, yıllık sayılar toplamı tutar; ilk fırlatma Sputnik (Baykonur, 1957-10-04)', LSD.sites.every((x) => x.launches.length === x.stats.total
  && x.launches.every((l, k, a) => /^[SFEU]$/.test(l.o) && (!k || a[k - 1].d <= l.d)) && Object.values(x.byYear).reduce((n, v) => n + v, 0) === x.stats.total)
  && lsBy.baykonur.launches[0].d === '1957-10-04' && lsBy.baykonur.stats.first === '1957-10-04');
check('üsler: GCAT kodları birleşti (Baykonur NIIP-5 + GIK-5; Wallops tek üs); Palmachim ters yönlü (eğim > 90°)', ['GIK-5', 'NIIP-5'].every((c) => lsBy.baykonur.gcat.includes(c)) && !lsBy['wallops-i'] && lsBy.wallops
  && lsBy.palmachim.launches.some((l) => l.o === 'S' && l.inc > 90));
check('konum fiziği: ekvator dönüşü 465 m/s; Kourou 463, Plesetsk 212; en düşük eğim = enlem; azimut 90° → eğim = enlem', Math.round(LS.V_EQ) === 465 && Math.round(LS.rotSpeed(5.24)) === 463 && Math.round(LS.rotSpeed(62.92)) === 212
  && LS.minIncl(-39.26) === 39.26 && Math.abs(LS.azimuthFor(28.5, 28.5) - 90) < 1e-6 && LS.azimuthFor(45, 30) === null);
check('konum fiziği: GTO → GEO ekvatordan ≈ 1477 m/s, 28,5°\'den ≈ 1837 m/s; LEO\'da 10° düzlem değişimi ≈ 1337 m/s; menzil azimutundan eğim (Canaveral 28,5°–59,7°)', Math.abs(LS.gtoToGeo(0) - 1477) < 3
  && Math.abs(LS.gtoToGeo(28.5) - 1837) < 3 && Math.abs(LS.planeChange(10) - 1337) < 3 && LS.inclFromAz(28.5, [35, 120]).join() === '28.5,59.7');
const ih = LS.inclHistogram(lsBy.plesetsk.launches);
check('eğim dağılımı: Plesetsk\'ten başarılı fırlatmaların hiçbiri enleminin (62,9°) 10° altında değil; eğim fırlatmaların %90\'ından fazlasında var (satcat ile)', ih.slice(0, 5).every((v) => v === 0) && ih.reduce((a, b) => a + b, 0) > 1000 && LSD.sites.flatMap((x) => x.launches).filter((l) => l.inc != null).length > 0.9 * LSD.total);
check('üs sayfaları: dizin, kayıt, küre, hesaplayıcı; site haritası ve arama; iki dilde metin; haftalık iş akışı üsleri de yeniler', fs.existsSync(new URL('../../site/app/[lang]/launches/sites/[slug]/page.jsx', import.meta.url))
  && /SiteGlobe/.test(rd('../../site/app/[lang]/launches/sites/page.jsx')) && /LaunchCalc/.test(rd('../../site/app/[lang]/launches/sites/page.jsx')) && /launches\/sites/.test(rd('../../site/app/sitemap.js'))
  && /SITES/.test(rd('../../site/app/search.json/route.js')) && en.ls.why.length === tr.ls.why.length && /usler\.mjs/.test(rd('../../.github/workflows/site-veri.yml')) && fs.existsSync(new URL('../../site/public/geo/coast-110m.json', import.meta.url)));
console.log('\nTüm lookstar19 denetimleri geçti');
