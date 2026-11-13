// Laboratuvar arayüzü tarayıcı denemesi (başsız Chromium): iki dallı gezinme (Canlı Gökyüzü · Laboratuvar), deney → motor eşlemesi (Ay görevi: görev motoru),
// Ay görevinin dört adımı (Görev → Araç ve güdüm → Uçuş → Sonuç; inişe atlayıp sonuç kartı), Saptırma deneyinin 4 adımı (hedef → yakın geçiş → itki → sonuç),
// "yakın geçiş yok" boş durumu, "çarpacak olsaydı" senaryosu, 3B yollar, çapraz bağlantılar ve telefon düzeni.
// İnternet gerekmez: api/* istekleri, bulut işlevleriyle (api/*.js) web/test/fixtures içindeki kaynak yanıtlarından karşılanır.
//   node tools/lab_deneme.mjs [adres] [--out=klasör] [--gpu]       (varsayılan adres http://127.0.0.1:8765/; web/ klasörü sunulmalı)
// Playwright + Chromium gerekir (bkz. perf_olcum.mjs): CHROME=/yol/chrome node tools/lab_deneme.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
const arg = process.argv.slice(2), gpu = arg.includes('--gpu');
const outDir = (arg.find((a) => a.startsWith('--out=')) || '').slice(6) || path.join(os.tmpdir(), 'ls19-lab');
const base = (arg.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:8765/').replace(/\/?$/, '/');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium; try { ({ chromium } = await import('playwright-core')); } catch (e) { console.error('playwright-core yok: npm i -g playwright-core (bkz. tools/perf_olcum.mjs)'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

// ---- api/* taklidi: kaynak (JPL, CelesTrak) yanıtları yerel dosyalardan; işlevler gerçek
const fx = path.join(root, 'web/test/fixtures/') , file = (f) => fs.readFileSync(fx + f, 'utf8');
const upstream = async (url) => {
  const u = String(url); let body;
  if (u.includes('sbdb_query') && u.includes('sb-group=neo')) body = file('sb_neo.json');
  else if (u.includes('sbdb_query')) body = file('sb_mb.json');
  else if (u.includes('sentry.api')) body = file('sentry.json');
  else if (u.includes('sbdb.api')) body = file('sbdb_99942.json');
  else return new Response('yok', { status: 404 });
  return new Response(body, { status: 200 });
};
const apiCache = new Map();
async function api(route) {
  const u = new URL(route.request().url()), name = u.pathname.replace(/^.*\/api\//, '').replace(/\/$/, '');
  if (name === 'sbdb' && u.searchParams.get('des') !== '99942') return route.fulfill({ status: 404, contentType: 'application/json', body: '{"hata":"çevrimdışı deneme: yalnız 99942 (Apophis) ayrıntısı var"}' });
  if (!['asteroids', 'sentry', 'sbdb', 'surum'].includes(name)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"hata":"çevrimdışı deneme"}' });
  const key = name + u.search; let r = apiCache.get(key);
  if (!r) {
    const real = globalThis.fetch; globalThis.fetch = upstream;
    try {
      const m = await import(pathToFileURL(path.join(root, 'api', name + '.js')).href), res = await m.GET(new Request('https://ls19.example/api/' + name + u.search));
      const headers = Object.fromEntries(res.headers.entries()); let body = Buffer.from(await res.arrayBuffer());
      if (headers['content-encoding'] === 'gzip') { body = gunzipSync(body); delete headers['content-encoding']; }           // CDP yanıt taklidinde içerik kodlaması çözülmez: düz gönderilir
      r = { status: res.status, headers, body }; apiCache.set(key, r);
    } finally { globalThis.fetch = real; }
  }
  return route.fulfill({ status: r.status, headers: r.headers, body: r.body });
}

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', ...(gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'])], ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
const res = []; const check = (name, ok, d = '') => { res.push(ok); console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${d ? ' — ' + d : ''}`); };

async function open(ctxOpt, query) {
  const ctx = await browser.newContext(ctxOpt), page = await ctx.newPage(), errors = [];
  page.setDefaultNavigationTimeout(240000); page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/ERR_CERT|ERR_TUNNEL|Failed to load resource|net::ERR|blocked by CORS policy/.test(t)) errors.push('console: ' + t.slice(0, 200)); });
  await page.route('**/api/**', api);
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ls19.lang', 'tr'); localStorage.setItem('ls19.vehicle', 'two'); localStorage.setItem('ls19.landing', 'opt'); } catch (e) { /* */ } });
  await page.goto(base + 'index.html' + query, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
  return { ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: path.join(outDir, name + '.png'), timeout: 200000, animations: 'disabled' });          // yazılım çiziminde kareler yavaş: geçişler yarıda kalmasın
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, sel);
const txt = (page, sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
const stepOpen = (page) => page.evaluate(() => { const o = [...document.querySelectorAll('#dfSteps .step')].findIndex((li) => li.classList.contains('open')); return o + 1; });
const waitCas = (page) => page.waitForFunction(() => window.LS19.deflect && window.LS19.deflect.scanned, null, { timeout: 280000 });

// ================================================================= masaüstü
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } }, '?sats=0&mode=lab');
  await page.waitForFunction(() => window.LS19.asts && window.LS19.asts.n > 0, null, { timeout: 120000 });
  check('iki dallı üst çubuk: Canlı Gökyüzü · Laboratuvar (Laboratuvar etkin)', await page.evaluate(() => { const b = [...document.querySelectorAll('#modebar [data-workspace]')]; return b.map((x) => x.dataset.workspace).join() === 'sky,lab' && b[1].classList.contains('on') && document.body.dataset.mode === 'lab'; }));
  check('Laboratuvar paneli görünür; Canlı Gökyüzü paneli ve saati gizli', (await vis(page, '#labPanel')) && !(await vis(page, '#skyPanel')) && !(await vis(page, '#skyHud')));
  check('ana sayfa motoru değiştirmez: açılıştaki görev motoru sürer, görev çubuğu görünür, zaman/kamera çubuğu gizli', await page.evaluate(() => window.LS19.mode === 'mission' && document.body.dataset.engine === 'mission') && (await vis(page, '#controls')) && !(await vis(page, '#skyControls')));
  check('deney merkezi ağacı: 3 dal (Ay görevi, Asteroit saptırma, Çarpma riski)', await page.evaluate(() => [...document.querySelectorAll('#lab-home .exp')].map((b) => b.querySelector('b').textContent).join('|') === 'Ay görevi|Asteroit saptırma|Çarpma riski'));
  check('Saptırma artık Canlı Gökyüzü sekmelerinde değil (sekmeler: Takip, Uydular, Asteroitler, Çarpma, Fırlatmalar)', await page.evaluate(() => [...document.querySelectorAll('#skyPanel .tab')].map((b) => b.dataset.tab).join() === 'takip,uydular,asteroit,carpma,firlatma'));
  await shot(page, '1-merkez');

  await page.click('#lab-home [data-exp=saptirma]');
  check('deneye girince geri düğmesi ve başlık: Laboratuvar › Asteroit saptırma', (await vis(page, '#labBack')) && (await txt(page, '#labTitle')) === 'Asteroit saptırma' && (await stepOpen(page)) === 1);
  check('saptırma gökyüzü motoruna geçirir: zaman/kamera çubuğu görünür; uçuş göstergesi ve görev çubuğu gizli; adres exp=saptirma', await page.evaluate(() => window.LS19.mode === 'sky' && document.body.dataset.engine === 'sky' && /exp=saptirma/.test(location.search)) && (await vis(page, '#skyControls')) && !(await vis(page, '#hud')) && !(await vis(page, '#controls')));
  check('2–4. adımlar kilitli (önce hedef seçilmeli)', await page.evaluate(() => [2, 3, 4].every((n) => document.querySelector(`#dfSteps .step[data-step="${n}"] .sh`).disabled)));
  check('hızlı seçim çipleri katalog gelince etkin (Apophis, Bennu, Didymos)', await page.evaluate(() => ['99942', '101955', '65803'].every((d) => !document.querySelector(`#dfQuick [data-des="${d}"]`).disabled)));
  await page.fill('#dfSearch', 'Betulia'); await page.waitForSelector('#dfResults li');
  check('arama sonucu: 1580 Betulia', (await txt(page, '#dfResults')).includes('Betulia'));
  await shot(page, '2-hedef');

  // ---- Betulia: yakın geçiş yok → boş durum
  await page.click('#dfResults li');
  await waitCas(page);
  check('Betulia: 0 yakın geçiş → açıklayıcı boş durum, "120 yıla uzat" ve "başka hedef" eylemleri', (await stepOpen(page)) === 2 && (await vis(page, '#dfCasEmpty')) && (await vis(page, '#dfLonger')) && (await vis(page, '#dfOther')) && (await page.evaluate(() => document.querySelector('#dfNext2').disabled)), (await txt(page, '#dfEmptyTxt')).trim());
  check('hedef kartında "yakın geçiş bulunamayabilir" uyarısı (MOID > 0,05 AB)', (await txt(page, '#dfTarget')).includes('bulunamayabilir'));
  await shot(page, '3-bos-durum');
  await page.click('#dfLonger'); await waitCas(page);
  check('"120 yıla uzat" yeniden tarar (bu hedefte hâlâ yakın geçiş yok; uzat düğmesi gizlenir)', (await page.evaluate(() => +document.querySelector('#dfYears').value)) === 120 && !(await vis(page, '#dfLonger')));

  // ---- Apophis: tam akış
  await page.click('#dfOther'); check('"Başka hedef seç" 1. adıma döner', (await stepOpen(page)) === 1);
  await page.click('#dfQuick [data-des="99942"]'); await waitCas(page);
  const cas = await page.evaluate(() => [...document.querySelectorAll('#dfCas .cacard')].map((b) => ({ d: b.querySelector('.cd').textContent, m: b.querySelector('.cm').textContent, on: b.getAttribute('aria-checked') })));
  check('Apophis: yakın geçiş kartları, en yakını (13 Nisan 2029) seçili', cas.length >= 1 && cas.some((c) => /13 Nisan 2029/.test(c.d) && c.on === 'true'), JSON.stringify(cas.slice(0, 3)));
  check('1. adım özeti hedefi, 2. adım özeti geçişi gösterir', (await page.evaluate(() => [...document.querySelectorAll('#dfSteps .ss')].slice(0, 2).map((e) => e.textContent).join(' || '))).includes('Apophis') && (await txt(page, '#dfSteps [data-step="2"] .ss')).includes('13 Nisan 2029'));
  await shot(page, '4-gecis');
  await page.click('#dfNext2');
  check('"Bu geçişle devam" 3. adımı açar; itki zamanı çipleri (2 yıl önce varsayılan) ve itki tarihi', (await stepOpen(page)) === 3 && (await page.evaluate(() => document.querySelector('#dfLeads .chip.on') && document.querySelector('#dfLeads .chip.on').textContent)) === '2 yıl önce' && /^2027-04-1[2-4]$/.test(await page.evaluate(() => document.querySelector('#dfApply').value)));
  check('uygun olmayan itki zamanları (5 ve 10 yıl önce: tarama başlangıcından önce) çip olarak sunulmaz', await page.evaluate(() => [...document.querySelectorAll('#dfLeads .chip')].map((c) => c.textContent).join() === '2 yıl önce,1 yıl önce,3 ay önce'));
  await shot(page, '5-itki');
  // yanlış girdi: kuvvet/süre geçişten sonra biter
  await page.check('input[name=dfMethod][value=thrust]'); await page.fill('#dfDays', '2000'); await page.click('#dfRun');
  check('geçersiz itki (süre yakın geçişi aşar) hesaplamadan önce düz dille reddedilir', (await stepOpen(page)) === 3 && /bitmeli/.test(await txt(page, '#dfStatus')), (await txt(page, '#dfStatus')).trim());
  await page.check('input[name=dfMethod][value=kinetic]');
  await page.click('#dfRun');
  await page.waitForFunction(() => !document.querySelector('#dfResult').hidden, null, { timeout: 280000 });
  const v1 = await page.evaluate(() => ({ cls: document.querySelector('#dfVerdict').className, t: document.querySelector('#dfVT').textContent, d: document.querySelector('#dfVD').textContent, need: document.querySelector('#dfNeed').textContent, step: [...document.querySelectorAll('#dfSteps .step')].findIndex((li) => li.classList.contains('open')) + 1,
    cv: (() => { const c = document.querySelector('#dfBplane'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })() }));
  check('Sonuç (4. adım açık): karar kartı, "ne kadar gerekir" cümlesi ve B-düzlemi grafiği çizildi', v1.step === 4 && v1.t.length > 3 && /kg/.test(v1.need) && v1.cv > 500, `${v1.t} — ${v1.d.slice(0, 110)}`);
  check('gerçek yörünge senaryosunda yargı "ıskalamaya devam eder" (kinetik, 2 yıl önce)', v1.cls.includes('info') || v1.cls.includes('good'), v1.cls);
  const un1 = await page.evaluate(() => ({ h: document.querySelector('#dfUnc').hidden, t: document.querySelector('#dfUT').textContent, d: document.querySelector('#dfUD').textContent }));
  check('belirsizlik kutusu: gerçek yörüngede itkisiz → itkili çarpma olasılığı ve kayma aralığı (kovaryanssız yanıtta bunu söyler)', !un1.h && /Çarpma olasılığı: itkisiz %0 → itkili %0/.test(un1.t) && /kovaryansı yok/.test(un1.d) && /%90 olasılıkla/.test(un1.d), `${un1.t} — ${un1.d.slice(0, 120)}`);
  const lt1 = await page.evaluate(() => ({ vis: !document.querySelector('#dfLaterBox').hidden, rows: [...document.querySelectorAll('#dfLater tbody tr')].map((r) => r.textContent), enc: !!window.LS19.deflect.result.enc }));
  check('sonraki yakın geçişler: nominal ve saptırılmış yörünge 2029 sonrası tümlenir (2051 geçişi listede); rezonans geometrisi var', lt1.vis && lt1.enc && lt1.rows.some((t) => /2051/.test(t)), lt1.rows.slice(0, 3).join(' | '));
  const u1 = await page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
  check('sonuç adrese yazılır (hedef, geçiş günü, itki günü, yöntem) ve "Denemelerim" tablosuna eklenir', u1.hedef === '99942' && u1.gecis === '2029-04-13' && /^2027-04-1[2-4]$/.test(u1.itki) && u1.yontem === 'kin' && u1.exp === 'saptirma'
    && (await vis(page, '#dfHist')) && (await page.evaluate(() => document.querySelectorAll('#dfHistTbl tbody tr').length)) === 1, JSON.stringify(u1));
  await shot(page, '6-sonuc');
  // ayrıntılar katlanır ve açılınca grafik çizilir
  await page.click('#dfResult .adv > summary'); await page.waitForTimeout(600);
  const sw = await page.evaluate(() => { const c = document.querySelector('#dfSweep'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return { n, rows: document.querySelectorAll('#dfOut tr').length }; });
  check('"Tüm ayrıntılar" açılınca tablo ve önceden uyarı eğrisi görünür', sw.n > 500 && sw.rows >= 8, JSON.stringify(sw));
  await page.evaluate(() => document.querySelector('#dfResult .adv').scrollIntoView());
  await shot(page, '7-ayrintilar');

  // ---- "çarpacak olsaydı" senaryosu, stale işareti ve yeniden hesap
  await page.click('#dfAgain'); check('"İtkiyi değiştir" 3. adıma döner, seçimler korunur (2 yıl önce)', (await stepOpen(page)) === 3 && (await page.evaluate(() => document.querySelector('#dfLeads .chip.on').textContent)) === '2 yıl önce');
  await page.check('input[name=dfScn][value=hypo]'); await page.fill('#dfMass', '5000');
  check('ayar değişince eski sonuç "eski" olarak işaretlenir (4. adım özeti)', (await txt(page, '#dfSteps [data-step="4"] .ss')).includes('yeniden hesaplayın'));
  await page.click('#dfRun');
  await page.waitForFunction(() => !document.querySelector('#dfResult').hidden && document.querySelector('#dfStale').hidden && /çarpma noktası|Dünya|yetmez/i.test(document.querySelector('#dfVD').textContent), null, { timeout: 280000 });
  const v2 = await page.evaluate(() => ({ cls: document.querySelector('#dfVerdict').className, t: document.querySelector('#dfVT').textContent, g: !document.querySelector('#dfGauge').hidden, gt: document.querySelector('#dfGaugeTxt').textContent }));
  check('"Çarpacak olsaydı": karar kurtarır/yetmez ve ölçek çubuğu görünür', /good|bad/.test(v2.cls) && v2.g && /gereken/.test(v2.gt), `${v2.t} — ${v2.gt}`);
  const un2 = await page.evaluate(() => ({ t: document.querySelector('#dfUT').textContent, d: document.querySelector('#dfUD').textContent, c: document.querySelector('#dfUnc').className }));
  check('belirsizlik kutusu: çarpacak olsaydı → ıskalama olasılığı ve %95 güven için gereken çarpıcı', /Belirsizlikle: %[\d,]+ olasılıkla ıskalar/.test(un2.t) && /%95 güvenle/.test(un2.d) && /good|bad|warn/.test(un2.c), `${un2.t} — ${un2.d.slice(0, 140)}`);
  const link2 = await page.evaluate(() => location.search), hist2 = await page.evaluate(() => [...document.querySelectorAll('#dfHistTbl tbody tr')].map((r) => r.textContent));
  check('ikinci deneme geçmişin başında; adres yeni ayarları taşır (m=5000, senaryo=varsayim)', hist2.length === 2 && /çarpacak olsaydı/.test(hist2[0]) && /m=5000/.test(link2) && /senaryo=varsayim/.test(link2), hist2[0]);
  await shot(page, '8-carpacak-olsaydi');

  // ---- önleme görevi: fırlatma penceresi (Lambert) → çözümü uygula → hesapla
  await page.click('#dfAgain'); await page.click('#dfIc > summary'); await page.click('#dfIcRun');
  const icOk = await page.waitForFunction(() => !document.querySelector('#dfIcOut').hidden && window.LS19.deflect.pc, null, { timeout: 280000 }).then(() => true, () => false);
  const ic = await page.evaluate(() => ({ best: !!window.LS19.deflect.pc.best, rows: document.querySelectorAll('#dfIcBest tr').length, msg: document.querySelector('#dfIcMsg').textContent,
    cv: (() => { const c = document.querySelector('#dfPork'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })() }));
  check('önleme görevi: Falcon Heavy ile fırlatma penceresi (Lambert örgüsü) çizilir, en iyi çözüm 7 satırla özetlenir', icOk && ic.best && ic.rows === 7 && ic.cv > 2000 && /yörünge denendi/.test(ic.msg), JSON.stringify(ic));
  await shot(page, '8b-onleme'); await page.locator('#dfIcOut').screenshot({ path: path.join(outDir, '8c-firlatma-penceresi.png'), timeout: 200000 });
  await page.click('#dfIcUse');
  const used = await page.evaluate(() => ({ dir: document.querySelector('#dfDir').value, m: +document.querySelector('#dfMass').value, kin: document.querySelector('input[name=dfMethod][value=kinetic]').checked, b: window.LS19.deflect.pc.best }));
  check('"Bu çözümü kullan": yöntem kinetik, kütle roketin kapasitesi, yön önleme yörüngesinden', used.dir === 'vec' && used.kin && used.m === Math.floor(used.b.m) && used.m > 100, JSON.stringify({ dir: used.dir, m: used.m }));
  await page.click('#dfRun');
  await page.waitForFunction(() => !document.querySelector('#dfResult').hidden && document.querySelector('#dfStale').hidden && /yv=/.test(location.search), null, { timeout: 280000 });
  const vi = await page.evaluate(() => ({ t: document.querySelector('#dfVT').textContent, dir: [...document.querySelectorAll('#dfOut td')].map((x) => x.textContent).join(' | '), sh: window.LS19.deflect.result && Math.hypot(window.LS19.deflect.result.dXi, window.LS19.deflect.result.dZeta), pred: window.LS19.deflect.pc.best.shift }));
  check('önleme çözümüyle hesap: kayma pencere öngörüsüyle %5 içinde, yön tabloda, bağlantıda yv', /önleme yörüngesinden/.test(vi.dir) && Math.abs(vi.sh - vi.pred) < 0.05 * vi.pred, `${vi.t} — kayma ${vi.sh && vi.sh.toFixed(1)} km, öngörü ${vi.pred.toFixed(1)} km`);

  // ---- çekim traktörü: kuvvet fizikten, sonuç tablosunda; kinetik değilken parçalanma kutusu yok
  await page.click('#dfAgain'); await page.check('input[name=dfMethod][value=tractor]');
  const gtF = await txt(page, '#dfGtF');
  check('çekim traktörü seçilince kuvvet G·M·m/d² ile gösterilir, kinetik alanları ve önleme bölümü gizlenir', /F = G·M·m\/d² ≈ [\d,]+ N/.test(gtF) && !(await vis(page, '#dfKin')) && !(await vis(page, '#dfIc')) && (await vis(page, '#dfGt')), gtF);
  await page.click('#dfRun');
  await page.waitForFunction(() => !document.querySelector('#dfResult').hidden && document.querySelector('#dfStale').hidden && /yontem=cek/.test(location.search), null, { timeout: 280000 });
  const gt = await page.evaluate(() => ({ row: [...document.querySelectorAll('#dfOut tr')].map((r) => r.textContent).find((t) => /Çekim traktörü/.test(t)) || '', need: document.querySelector('#dfNeed').textContent, dis: document.querySelector('#dfDisrupt').hidden, u: document.querySelector('#dfUD').textContent }));
  check('çekim traktörü sonucu: tablo satırı, "ne kadar gerekir" araç kütlesiyle, belirsizlik yalnız çaptan, parçalanma kutusu yok', /20\.000 kg · 2,0 yarıçap/.test(gt.row) && /yarıçap uzaklıkta/.test(gt.need) && gt.dis && /kütlesinden bağımsızdır/.test(gt.u), `${gt.row} — ${gt.need.slice(0, 90)}`);
  await page.check('input[name=dfMethod][value=kinetic]'); await page.click('#dfRun');
  await page.waitForFunction(() => !document.querySelector('#dfResult').hidden && document.querySelector('#dfStale').hidden && /yontem=kin/.test(location.search), null, { timeout: 280000 });

  // ---- 3B
  await page.click('#df3d');
  check('"3B\'de göster": yollar etkin, kamera Dünya merkezli', await page.waitForFunction(() => !!window.LS19.deflect.paths && window.LS19.world.cam.mode === 'EARTH' && window.LS19.deflect.pathD.visible, null, { timeout: 60000 }).then(() => true, () => false));
  await page.waitForTimeout(1500);
  await shot(page, '9-3b');

  // ---- çapraz bağlantılar ve alan değiştirme
  await page.click('#labBack'); check('geri düğmesi merkeze döner; ana sayfa gökyüzü motorunu bırakmaz', (await txt(page, '#labTitle')) === 'Laboratuvar' && (await vis(page, '#lab-home')) && await page.evaluate(() => window.LS19.mode === 'sky' && !/exp=/.test(location.search)));
  await page.click('#lab-home [data-exp=ay]');
  check('"Ay görevi" Laboratuvar içinde açılır: görev motoru, Görev sekmesi, uçuş göstergesi ve görev çubuğu; adres exp=ay', await page.evaluate(() => window.LS19.view === 'lab' && window.LS19.labui.page === 'ay' && window.LS19.mode === 'mission' && document.body.dataset.engine === 'mission' && !document.querySelector('#tab-gorev').hidden && document.querySelector('#labTitle').textContent === 'Ay görevi' && /exp=ay/.test(location.search)) && (await vis(page, '#hud')) && (await vis(page, '#controls')) && (await vis(page, '#lab-ay .tabs')) && !(await vis(page, '#skyControls')));
  await page.click('#lab-ay [data-tab=dv]');
  check('Ay görevi sekmeleri Laboratuvar panelinde çalışır (Δv sekmesi; saptırma sayfası gizli kalır)', await page.evaluate(() => !document.querySelector('#tab-dv').hidden && document.querySelector('#tab-gorev').hidden && document.querySelector('#lab-saptirma').hidden && window.LS19.ui.tab === 'dv'));
  await shot(page, '10-ay-gorevi');
  await page.mouse.click(5, 790); await page.keyboard.press('Escape');
  check('Esc deneyden Laboratuvar ana sayfasına döner', await page.evaluate(() => window.LS19.labui.page === 'home'));
  await page.keyboard.press('m'); check('M kısayolu: Laboratuvar → Canlı Gökyüzü', await page.evaluate(() => window.LS19.view === 'sky' && window.LS19.mode === 'sky'));
  await page.keyboard.press('m'); check('… → Laboratuvar (açık sayfa korunur)', await page.evaluate(() => window.LS19.view === 'lab' && window.LS19.labui.page === 'home') && (await vis(page, '#labPanel')));
  await page.click('#lab-home [data-exp=ay]'); await page.keyboard.press('k');
  check('K kısayolu Ay görevinin Kontrol sekmesini açar', await page.evaluate(() => window.LS19.labui.page === 'ay' && !document.querySelector('#tab-kontrol').hidden));
  await page.click('[data-workspace=sky]'); await page.evaluate(() => window.LS19.ui.setTab('asteroit'));
  await page.evaluate(() => { const A = window.LS19.asts; A.select(A.index.get('99942')); });
  await page.waitForFunction(() => /Laboratuvarda dene/.test(document.querySelector('#astSel').textContent), null, { timeout: 30000 });
  await page.click('#astSel button:has-text("Laboratuvarda dene")');
  check('Asteroitler sekmesindeki "Laboratuvarda dene" Laboratuvar alanında saptırma deneyini bu hedefle açar', await page.evaluate(() => window.LS19.view === 'lab' && window.LS19.labui.page === 'saptirma' && /Apophis/.test(document.querySelector('#dfSteps .ss').textContent)));
  check('konsol hatası yok (masaüstü)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ================================================================= paylaşılan bağlantı: aynı deneme kendiliğinden kurulur ve hesaplanır
{
  const q = '?sats=0&mode=lab&exp=saptirma&hedef=99942&yil=50&gecis=2029-04-13&yontem=kin&m=5000&U=6.1&beta=3.6&itki=2027-04-13&yon=along&senaryo=varsayim';
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } }, q);
  const done = await page.waitForFunction(() => window.LS19.deflect && window.LS19.deflect.result && !document.querySelector('#dfResult').hidden, null, { timeout: 280000 }).then(() => true, () => false);
  const st = await page.evaluate(() => ({ step: [...document.querySelectorAll('#dfSteps .step')].findIndex((li) => li.classList.contains('open')) + 1, t: document.querySelector('#dfVT').textContent, m: document.querySelector('#dfMass').value,
    hypo: document.querySelector('input[name=dfScn][value=hypo]').checked, ap: document.querySelector('#dfApply').value, g: !document.querySelector('#dfGauge').hidden, s1: document.querySelector('#dfSteps .ss').textContent }));
  check('bağlantı: Apophis seçilir, 13 Nisan 2029 geçişi taranır, itki ayarları kurulur ve sonuç kendiliğinden hesaplanır', done && st.step === 4 && /Apophis/.test(st.s1) && st.m === '5000' && st.hypo && st.ap === '2027-04-13' && st.g, JSON.stringify(st));
  await page.click('#dfLink').catch(() => {});
  check('"Bağlantıyı kopyala" adresi panoya ya da kopyalama kutusuna verir (hata yok)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.click('#labBack'); await page.click('#lab-home [data-exp=ay]');
  check('başka deneye geçince saptırma parametreleri adresten silinir', await page.evaluate(() => /exp=ay/.test(location.search) && !/hedef=|gecis=/.test(location.search)));
  await ctx.close();
}

// ================================================================= adres parametreleri ve öteki alanlar (gerileme)
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } }, '?sats=0&ast=0&mode=lab&exp=saptirma');
  check('?mode=lab&exp=saptirma doğrudan Laboratuvar › Asteroit saptırma\'yı açar', await page.evaluate(() => window.LS19.view === 'lab' && window.LS19.labui.page === 'saptirma' && document.querySelector('#labTitle').textContent === 'Asteroit saptırma'));
  check('katalog kapalıyken (?ast=0) hızlı seçim çipleri etkisiz, durum satırı bilgi verir', await page.evaluate(() => [...document.querySelectorAll('#dfQuick .chip')].every((c) => c.disabled) && document.querySelector('#dfCatalog').textContent.length > 3));
  await page.goto(base + 'index.html?sats=0&ast=0&tab=saptirma', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
  check('eski adres ?tab=saptirma Laboratuvar › Asteroit saptırma\'yı açar', await page.evaluate(() => window.LS19.view === 'lab' && window.LS19.labui.page === 'saptirma'));
  await page.goto(base + 'index.html?sats=0&ast=0', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
  check('varsayılan açılış Laboratuvar › Ay görevi: HUD, görev çubuğu ve Ay görevi sekmeleri görünür, düğme etkin', (await vis(page, '#hud')) && (await vis(page, '#controls')) && (await vis(page, '#lab-ay')) && !(await vis(page, '#lab-home')) && await page.evaluate(() => document.querySelector('[data-workspace=lab]').classList.contains('on') && window.LS19.view === 'lab' && window.LS19.labui.page === 'ay' && window.LS19.mode === 'mission'));
  await page.click('[data-workspace=sky]');
  check('Canlı Gökyüzü: saat ve panel görünür, Laboratuvar paneli gizli', (await vis(page, '#skyHud')) && (await vis(page, '#skyPanel')) && !(await vis(page, '#labPanel')));
  await page.click('[data-workspace=lab]'); await page.click('[data-workspace=sky]');
  await page.click('[data-workspace=lab]');
  check('Canlı Gökyüzü → Laboratuvar: açık deney (Ay görevi) geri gelir, görev motoru yeniden seçilir', await page.evaluate(() => window.LS19.view === 'lab' && window.LS19.labui.page === 'ay' && window.LS19.mode === 'mission') && (await vis(page, '#hud')));
  await page.evaluate(() => window.LS19.labui.show('home')); await page.click('[data-workspace=sky]'); await page.click('[data-workspace=lab]'); await page.click('[data-workspace=sky]');
  check('Laboratuvar ana sayfası ↔ Canlı Gökyüzü geçişi aynı gökyüzü motorunda kalır (motor yeniden kurulmaz)', await page.evaluate(() => window.LS19.mode === 'sky' && window.LS19.view === 'sky'));
  for (const [q, want, name] of [['mode=mission', 'ay', 'eski ?mode=mission'], ['tab=kontrol', 'ay', 'eski ?tab=kontrol']]) {
    await page.goto(base + 'index.html?sats=0&ast=0&' + q, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
    check(name + ' Laboratuvar › Ay görevi\'ni açar' + (q === 'tab=kontrol' ? ' (Kontrol sekmesi)' : ''), await page.evaluate(([w, k]) => window.LS19.view === 'lab' && window.LS19.labui.page === w && window.LS19.mode === 'mission' && (!k || !document.querySelector('#tab-kontrol').hidden), [want, q === 'tab=kontrol']));
  }
  check('konsol hatası yok (alan geçişleri)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ================================================================= Laboratuvar › Ay görevi: dört adım (Görev → Araç ve güdüm → Uçuş → Sonuç)
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } }, '?sats=0&ast=0');
  const stepOn = () => page.evaluate(() => (document.querySelector('#lab-ay > .tabs .tab.on') || {}).dataset?.tab);
  check('Ay görevi dört adımla açılır: 1. adım (Görev) etkin, özetler dolu', (await stepOn()) === 'gorev' && await page.evaluate(() => ['gorev', 'arac', 'ucus', 'dv'].join() === [...document.querySelectorAll('#lab-ay > .tabs .tab')].map((b) => b.dataset.tab).join()
    && /Eki 2026/.test(document.querySelector('#aySum-gorev').textContent) && document.querySelector('#aySum-arac').textContent === 'İki kademe · Optimal' && /Hazır|T\+/.test(document.querySelector('#aySum-ucus').textContent) && document.querySelector('#aySum-dv').textContent === 'İnişte belli olur'),
    await page.evaluate(() => [...document.querySelectorAll('#lab-ay .ss')].map((e) => e.textContent).join(' | ')));
  check('1. ve 2. adım tamam işaretli (görev kurulu)', await page.evaluate(() => ['gorev', 'arac'].every((t) => document.querySelector(`#lab-ay > .tabs .tab[data-tab="${t}"]`).classList.contains('done'))));
  check('1. adım: profil ve tarih görünür, yörünge ayrıntıları katlı', (await vis(page, '#cfgProfile')) && (await vis(page, '#dateInput')) && !(await page.evaluate(() => document.querySelector('#cfgBox').open)));
  await shot(page, 'a1-gorev');
  await page.click('#tab-gorev [data-goto=arac]');
  check('"Devam" 2. adımı açar: araç ve güdüm kartları, seçili olanlar işaretli', (await stepOn()) === 'arac' && await page.evaluate(() => document.querySelector('#tab-arac [data-vehicle="two"]').classList.contains('on') && document.querySelector('#tab-arac [data-landing="opt"]').classList.contains('on')));
  await page.click('#tab-arac [data-landing="zem"]');
  check('paneldeki güdüm seçimi görev çubuğu menüsüyle eşlenir ve özet güncellenir', await page.waitForFunction(() => document.querySelector('#controls [data-landing="zem"]').classList.contains('on') && document.querySelector('#aySum-arac').textContent === 'İki kademe · ZEM/ZEV', null, { timeout: 10000 }).then(() => true, () => false));
  await page.click('#tab-arac [data-landing="opt"]');
  await shot(page, 'a2-arac');
  await page.click('#tab-arac [data-goto=ucus]');
  check('3. adım (Uçuş): Çizelge açık, görev çizelgesi dolu', (await stepOn()) === 'ucus' && (await vis(page, '#tab-plan')) && await page.evaluate(() => document.querySelectorAll('#plan li').length > 5 && window.LS19.ui.tab === 'plan'));
  await page.click('#tab-ucus [data-tab=kontrol]');
  check('Uçuş aletleri: Kontrol sekmesi açılır, adım 3 etkin kalır, kare başına güncellenen sekme "kontrol"', (await stepOn()) === 'ucus' && (await vis(page, '#tab-kontrol')) && await page.evaluate(() => window.LS19.ui.tab === 'kontrol'));
  await page.click('#lab-ay > .tabs [data-tab=gorev]'); await page.keyboard.press('k');
  check('K kısayolu Uçuş adımını ve Kontrol aletini birlikte açar', (await stepOn()) === 'ucus' && await page.evaluate(() => !document.querySelector('#tab-kontrol').hidden));
  await page.click('#tab-ucus [data-tab=plan]');
  await shot(page, 'a3-ucus');
  // inişe atla (fizik deterministik: olaya atlama görevi baştan, ekransız koşar)
  await page.evaluate(() => { const p = window.LS19.ui.plan.find((q) => q.key === 'INDI'); window.LS19.send({ cmd: 'seek', t: p.t + 120 }); });
  const landed = await page.waitForFunction(() => /İniş ✓|Sert temas/.test(document.querySelector('#aySum-dv').textContent), null, { timeout: 280000 }).then(() => true, () => false);
  check('inişten sonra 4. adım özeti ve "yeni sonuç" işareti', landed && await page.evaluate(() => document.querySelector('#lab-ay > .tabs .tab[data-tab="dv"]').classList.contains('new') && document.querySelector('#aySum-ucus').textContent === 'Uçuş bitti'), await txt(page, '#aySum-dv'));
  await page.click('#lab-ay > .tabs [data-tab=dv]');
  const vr = await page.evaluate(() => ({ cls: document.querySelector('#ayVerdict').className, t: document.querySelector('#ayVT').textContent, d: document.querySelector('#ayVD').textContent, rows: [...document.querySelectorAll('#ayVTbl tr')].map((r) => r.textContent), isNew: document.querySelector('#lab-ay > .tabs .tab[data-tab="dv"]').classList.contains('new') }));
  check('4. adım (Sonuç): iniş başarılı kartı, temas ölçüleri; işaret kalkar', /good/.test(vr.cls) && vr.t === 'İniş başarılı' && vr.rows.length >= 5 && vr.rows.some((r) => /Kalan yakıt/.test(r)) && !vr.isNew, vr.rows.join(' · '));
  await shot(page, 'a4-sonuc');
  await page.click('#ayRestart');
  check('"Baştan uçur" görevi yeniden başlatır, Uçuş › Çizelge açılır, sonuç sıfırlanır', await page.waitForFunction(() => document.querySelector('#aySum-dv').textContent === 'İnişte belli olur' && !document.querySelector('#tab-plan').hidden && /info/.test(document.querySelector('#ayVerdict').className), null, { timeout: 60000 }).then(() => true, () => false));
  await page.goto(base + 'index.html?sats=0&ast=0&tab=dv', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
  check('eski ?tab=dv Sonuç adımını açar (Δv bütçesi ve karşılaştırma orada)', (await stepOn()) === 'dv' && (await vis(page, '#dvtable')) && (await vis(page, '#cmptable')));
  // dağılım denemesi (Monte Carlo): denemede 3 uçuş (seçenek listesine eklenir), ayrı iş parçacıkları
  await page.evaluate(() => { const sel = document.querySelector('#mcN'); sel.add(new Option('3', '3')); sel.value = '3'; });
  await page.click('#mcRun');
  const mcDone = await page.waitForFunction(() => /^3 uçuş/.test(document.querySelector('#mcMsg').textContent), null, { timeout: 280000 }).then(() => true, () => false);
  const mc = await page.evaluate(() => ({ t: document.querySelector('#mcVT').textContent, rows: document.querySelectorAll('#mcTbl tr').length, hist: document.querySelectorAll('#mcHistTbl tbody tr').length,
    cv: (() => { const c = document.querySelector('#mcScatter'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })(), seeds: window.LS19.aymc.runs.map((r) => r.seed).sort().join() }));
  check('Monte Carlo: 3 uçuş tamamlanır (tohum 1–3), başarı oranı, özet tablo, iniş/temas grafiği ve geçmiş satırı', mcDone && /^\d\/3 iniş başarılı/.test(mc.t) && mc.rows >= 6 && mc.cv > 300 && mc.hist === 1 && mc.seeds === '1,2,3', JSON.stringify(mc));
  check('konsol hatası yok (Ay görevi adımları)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ================================================================= telefon
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, '?sats=0&mode=lab');
  check('telefon: Laboratuvar paneli kendiliğinden açılır, üst çubuk 390 px\'e sığar (yatay taşma yok)', await page.evaluate(() => { const m = document.querySelector('#modebar').getBoundingClientRect(); return document.querySelector('#labPanel').classList.contains('open') && m.left >= 0 && m.right <= innerWidth + 0.5 && document.documentElement.scrollWidth <= innerWidth; }));
  await shot(page, 'm1-merkez');
  await page.waitForFunction(() => window.LS19.asts && window.LS19.asts.n > 0, null, { timeout: 120000 });
  await page.click('#lab-home [data-exp=saptirma]'); await page.click('#dfQuick [data-des="99942"]'); await waitCas(page);
  await shot(page, 'm2-gecis');
  await page.click('#dfNext2'); await shot(page, 'm3-itki');
  await page.click('#dfRun'); await page.waitForFunction(() => !document.querySelector('#dfResult').hidden, null, { timeout: 280000 });
  await page.waitForTimeout(800); await shot(page, 'm4-sonuc');
  check('telefon: hiçbir adım gövdesi paneli yatay taşırmaz', await page.evaluate(() => { const p = document.querySelector('#labPanel .labpage:not([hidden])'); return p.scrollWidth <= p.clientWidth + 1; }));
  await page.click('#df3d'); await page.waitForTimeout(1500);
  check('telefon: "3B\'de göster" paneli kapatır (3B görünüm açık kalsın)', await page.evaluate(() => !document.querySelector('#labPanel').classList.contains('open') && !!window.LS19.deflect.paths));
  await shot(page, 'm5-3b');
  await page.click('#btnSkyPanel'); await page.click('#labBack'); await page.click('#lab-home [data-exp=ay]');
  check('telefon: Laboratuvar › Ay görevi görev motorunu açar, adım çubuğu panele sığar', await page.evaluate(() => window.LS19.mode === 'mission' && document.querySelector('#labPanel').classList.contains('open') && (() => { const t = document.querySelector('#lab-ay > .tabs'); return t.scrollWidth <= t.clientWidth + 1 && document.querySelector('#labPanel').scrollWidth <= document.querySelector('#labPanel').clientWidth + 1; })()));
  await page.click('#btnPanel');
  check('telefon: görev çubuğundaki panel düğmesi Laboratuvar panelini kapatır (3B uçuş görünür)', await page.evaluate(() => !document.querySelector('#labPanel').classList.contains('open')) && (await vis(page, '#controls')) && (await vis(page, '#hud')));
  await shot(page, 'm6-ay-gorevi');
  check('konsol hatası yok (telefon)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
// ================================================================= telefon: varsayılan açılış (Ay görevi, panel kapalı)
{
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, '?sats=0&ast=0');
  check('telefon: varsayılan açılışta panel kapalı (3B uçuş ana içerik), görev çubuğu ve üst çubuk sığar', await page.evaluate(() => { const m = document.querySelector('#modebar').getBoundingClientRect(); return !document.querySelector('#labPanel').classList.contains('open') && window.LS19.labui.page === 'ay' && m.right <= innerWidth + 0.5 && document.documentElement.scrollWidth <= innerWidth; }) && (await vis(page, '#controls')));
  await shot(page, 'm0-acilis');
  check('konsol hatası yok (telefon açılış)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
const bad = res.filter((x) => !x).length;
console.log(bad ? `\n${bad} HATA` : `\nTüm denetimler geçti (ekran görüntüleri: ${outDir})`);
process.exit(bad ? 1 : 0);
