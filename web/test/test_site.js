// lookstar19 sitesi (site/) saf modülleri ve verisi — Node 20+: cd web && node test/test_site.js
//  veri: 33 cisim, alanlar, modeller sürüm paketinde; arama ve kısa ad; iki dil sözlüğü aynı yapıda; biçimlendirme (TR ondalık virgül);
//  fırlatma eşlemesi (resmî yayın önce, "Unknown" gösterilmez), sıradaki fırlatma, veri alınamazsa derlemede not / yayında eski sayfa;
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
check('şemalar: asteroit, uydu ve fırlatma sayfalarına bağlı', /withViz\(orbit, vz\)/.test(rd('../../site/app/[lang]/asteroids/[id]/page.jsx')) && /withViz\(derived, vz\)/.test(rd('../../site/app/[lang]/satellites/[id]/page.jsx'))
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
console.log('\nTüm lookstar19 denetimleri geçti');
