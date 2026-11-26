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
