// Laboratuvar arayüzü tarayıcı denemesi (başsız Chromium): üst düzey iki alan (Canlı Gökyüzü · Laboratuvar, Ay görevi Laboratuvar altında),
// Saptırma deneyinin 4 adımı (hedef → yakın geçiş → itki → sonuç), "yakın geçiş yok" boş durumu, "çarpacak olsaydı" senaryosu, 3B yollar,
// yeni deneyler (Ay'a iniş tezgâhı, asteroit → Dünya, uydu ↔ uydu/çöp, yeniden giriş: hedef seçici süzgeçleri, iş parçacığı, sonuç ve grafikler) ve telefon düzeni.
// İnternet gerekmez: api/* istekleri, bulut işlevleriyle (api/*.js) web/test/fixtures içindeki kaynak yanıtlarından karşılanır.
//   node tools/lab_deneme.mjs [adres] [--out=klasör] [--gpu] [--bolum=saptirma,adres,deneyler,telefon]   (varsayılan adres http://127.0.0.1:8765/; web/ sunulmalı)
// Playwright + Chromium gerekir (bkz. perf_olcum.mjs): CHROME=/yol/chrome node tools/lab_deneme.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
const arg = process.argv.slice(2), gpu = arg.includes('--gpu');
const outDir = (arg.find((a) => a.startsWith('--out=')) || '').slice(6) || path.join(os.tmpdir(), 'ls19-lab');
const base = (arg.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:8765/').replace(/\/?$/, '/');
const parts = ((arg.find((a) => a.startsWith('--bolum=')) || '').slice(8) || 'saptirma,adres,deneyler,telefon').split(','), part = (k) => parts.includes(k);
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
  else if (u.includes('gp.php') && u.includes('GROUP=active')) body = file('gp_active.json');
  else if (u.includes('gp.php') && /GROUP=[\w-]+-debris/.test(u)) body = JSON.stringify(debrisFixture(u.match(/GROUP=([\w-]+)-debris/)[1]));
  else return new Response('yok', { status: 404 });
  return new Response(body, { status: 200 });
};
// sınama için yapay çöp bulutu: GP kopyasındaki alçak yörüngeli cisimlerden türetilir (ad/numara değişir, ortalama anomali ve düğüm kaydırılır)
function debrisFixture(g) {
  const src = JSON.parse(file('gp_active.json')).filter((o) => +o.MEAN_MOTION > 13 && +o.ECCENTRICITY < 0.02).slice(0, 80);
  return src.map((o, k) => ({ ...o, OBJECT_NAME: `${g.toUpperCase()} DEB`, OBJECT_ID: '2009-005' + String.fromCharCode(65 + (k % 26)), NORAD_CAT_ID: 900000 + k,
    MEAN_ANOMALY: (+o.MEAN_ANOMALY + 37 * k) % 360, RA_OF_ASC_NODE: (+o.RA_OF_ASC_NODE + 11 * k) % 360, MEAN_MOTION: +o.MEAN_MOTION * (1 + 0.001 * ((k % 7) - 3)) }));
}
const apiCache = new Map();
async function api(route) {
  const u = new URL(route.request().url()), name = u.pathname.replace(/^.*\/api\//, '').replace(/\/$/, '');
  if (name === 'sbdb' && u.searchParams.get('des') !== '99942') return route.fulfill({ status: 404, contentType: 'application/json', body: '{"hata":"çevrimdışı deneme: yalnız 99942 (Apophis) ayrıntısı var"}' });
  if (!['asteroids', 'sentry', 'sbdb', 'surum', 'gp'].includes(name)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"hata":"çevrimdışı deneme"}' });
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
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/ERR_CERT|ERR_TUNNEL|Failed to load resource|net::ERR/.test(t)) errors.push('console: ' + t.slice(0, 200)); });
  await page.route('**/api/**', api);
  await page.route(/raw\.githubusercontent\.com|celestrak\.org/, (r) => r.fulfill({ status: 404, body: 'çevrimdışı deneme' }));           // GitHub kopyası / doğrudan CelesTrak: yalnız taklit veri
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ls19.vehicle', 'two'); localStorage.setItem('ls19.landing', 'opt'); } catch (e) { /* */ } });
  await page.goto(base + 'index.html' + query, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
  return { ctx, page, errors };
}
const shot = (page, name) => page.screenshot({ path: path.join(outDir, name + '.png'), timeout: 200000, animations: 'disabled' });          // yazılım çiziminde kareler yavaş: geçişler yarıda kalmasın
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, sel);
const txt = (page, sel) => page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', sel);
const stepOpen = (page) => page.evaluate(() => { const o = [...document.querySelectorAll('#dfSteps .step')].findIndex((li) => li.classList.contains('open')); return o + 1; });
const waitCas = (page) => page.waitForFunction(() => window.LS19.deflect && window.LS19.deflect.scanned, null, { timeout: 280000 });
const inked = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((c) => { if (!c.width) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i]) n++; return n; }), sel);
const openStep = (page, pg, n) => page.click(`#lab-${pg} .steps > li:nth-child(${n}) > .sh`);
const stepOf = (page, pg) => page.evaluate((p) => [...document.querySelectorAll(`#lab-${p} .steps > li`)].findIndex((li) => li.classList.contains('open')) + 1, pg);

// ================================================================= masaüstü: merkez + saptırma
if (part('saptirma')) {
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } }, '?sats=0&mode=lab');
  await page.waitForFunction(() => window.LS19.asts && window.LS19.asts.n > 0, null, { timeout: 120000 });
  check('üst çubuk iki alan: Canlı Gökyüzü · Laboratuvar (Laboratuvar etkin, Ay görevi kırıntısı gizli)', await page.evaluate(() => { const b = [...document.querySelectorAll('#modebar [data-workspace]')]; return b.map((x) => x.dataset.workspace).join() === 'sky,lab' && b[1].classList.contains('on') && document.body.dataset.mode === 'lab'; }) && !(await vis(page, '#modebar .mbcrumb')));
  check('Laboratuvar paneli görünür; Canlı Gökyüzü paneli ve saati gizli', (await vis(page, '#labPanel')) && !(await vis(page, '#skyPanel')) && !(await vis(page, '#skyHud')) && !(await vis(page, '#panel')));
  check('zaman/kamera çubuğu laboratuvarda da var', await vis(page, '#skyControls'));
  check('deney merkezi ağacı: 3 grup, 6 deney', await page.evaluate(() => [...document.querySelectorAll('#lab-home .grp')].length === 3 && [...document.querySelectorAll('#lab-home .exp')].map((b) => b.querySelector('b').textContent).join('|') === "Ay görevi|Ay'a iniş tezgâhı|Asteroit → Dünya|Uydu ↔ uydu / çöp|Uydu yeniden girişi|Asteroit saptırma"));
  check('Saptırma artık Canlı Gökyüzü sekmelerinde değil (sekmeler: Takip, Uydular, Asteroitler, Çarpma)', await page.evaluate(() => [...document.querySelectorAll('#skyPanel .tab')].map((b) => b.dataset.tab).join() === 'takip,uydular,asteroit,carpma'));
  await shot(page, '1-merkez');

  await page.click('#lab-home [data-exp=saptirma]');
  check('deneye girince geri düğmesi ve başlık: Laboratuvar › Asteroit saptırma', (await vis(page, '#labBack')) && (await txt(page, '#labTitle')) === 'Asteroit saptırma' && (await stepOpen(page)) === 1);
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
  await shot(page, '8-carpacak-olsaydi');

  // ---- 3B
  await page.click('#df3d');
  check('"3B\'de göster": yollar etkin, kamera Dünya merkezli', await page.waitForFunction(() => !!window.LS19.deflect.paths && window.LS19.world.cam.mode === 'EARTH' && window.LS19.deflect.pathD.visible, null, { timeout: 60000 }).then(() => true, () => false));
  await page.waitForTimeout(1500);
  await shot(page, '9-3b');

  // ---- çapraz bağlantılar ve alan değiştirme
  await page.click('#labBack'); check('geri düğmesi merkeze döner', (await txt(page, '#labTitle')) === 'Laboratuvar' && (await vis(page, '#lab-home')));
  await page.click('#lab-home [data-go=mission]');
  check('"Ay görevi" dalı Ay görevi alanını ve Görev sekmesini açar; üst çubukta Laboratuvar etkin + "› Ay görevi"', await page.evaluate(() => window.LS19.view === 'mission' && document.body.dataset.mode === 'mission' && !document.querySelector('#tab-gorev').hidden && document.querySelector('[data-workspace=lab]').classList.contains('on')) && await vis(page, '#modebar .mbcrumb'));
  await shot(page, '10-ay-gorevi');
  await page.click('[data-workspace=lab]'); check('Ay görevindeyken "Laboratuvar" Laboratuvar merkezine döner', await page.evaluate(() => window.LS19.view === 'lab' && window.LS19.labui.page === 'home'));
  await page.keyboard.press('m'); check('M kısayolu: Laboratuvar → Canlı Gökyüzü', await page.evaluate(() => window.LS19.view === 'sky'));
  await page.keyboard.press('m'); check('… → Laboratuvar', await page.evaluate(() => window.LS19.view === 'lab' && !document.querySelector('#labPanel').hidden));
  await page.click('[data-workspace=sky]'); await page.evaluate(() => window.LS19.ui.setTab('asteroit'));
  await page.evaluate(() => { const A = window.LS19.asts; A.select(A.index.get('99942')); });
  await page.waitForFunction(() => /Laboratuvarda dene/.test(document.querySelector('#astSel').textContent), null, { timeout: 30000 });
  await page.click('#astSel button:has-text("Laboratuvarda dene")');
  check('Asteroitler sekmesindeki "Laboratuvarda dene" Laboratuvar alanında saptırma deneyini bu hedefle açar', await page.evaluate(() => window.LS19.view === 'lab' && window.LS19.labui.page === 'saptirma' && /Apophis/.test(document.querySelector('#dfSteps .ss').textContent)));
  check('konsol hatası yok (masaüstü)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ================================================================= adres parametreleri ve öteki alanlar (gerileme)
if (part('adres')) {
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } }, '?sats=0&ast=0&mode=lab&exp=saptirma');
  check('?mode=lab&exp=saptirma doğrudan Laboratuvar › Asteroit saptırma\'yı açar', await page.evaluate(() => window.LS19.view === 'lab' && window.LS19.labui.page === 'saptirma' && document.querySelector('#labTitle').textContent === 'Asteroit saptırma'));
  check('katalog kapalıyken (?ast=0) hızlı seçim çipleri etkisiz, durum satırı bilgi verir', await page.evaluate(() => [...document.querySelectorAll('#dfQuick .chip')].every((c) => c.disabled) && document.querySelector('#dfCatalog').textContent.length > 3));
  await page.goto(base + 'index.html?sats=0&ast=0&tab=saptirma', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
  check('eski adres ?tab=saptirma Laboratuvar › Asteroit saptırma\'yı açar', await page.evaluate(() => window.LS19.view === 'lab' && window.LS19.labui.page === 'saptirma'));
  await page.goto(base + 'index.html?sats=0&ast=0', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
  check('varsayılan açılış Canlı Gökyüzü: saat ve panel görünür, görev ve Laboratuvar panelleri gizli, düğme etkin', (await vis(page, '#skyHud')) && (await vis(page, '#skyPanel')) && !(await vis(page, '#labPanel')) && !(await vis(page, '#hud')) && await page.evaluate(() => document.querySelector('[data-workspace=sky]').classList.contains('on') && window.LS19.view === 'sky'));
  await page.goto(base + 'index.html?sats=0&ast=0&cam=earth', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
  check('görev adres parametresi (?cam=…) Ay görevini açar: HUD ve görev paneli, üst çubukta Laboratuvar › Ay görevi', (await vis(page, '#hud')) && (await vis(page, '#panel')) && (await vis(page, '#modebar .mbcrumb')) && await page.evaluate(() => window.LS19.view === 'mission' && document.querySelector('[data-workspace=lab]').classList.contains('on')));
  await page.click('[data-workspace=sky]');
  check('Ay görevinden Canlı Gökyüzü\'ne: saat ve panel görünür, kırıntı gizli', (await vis(page, '#skyHud')) && (await vis(page, '#skyPanel')) && !(await vis(page, '#labPanel')) && !(await vis(page, '#modebar .mbcrumb')));
  await page.click('[data-workspace=lab]'); await page.click('[data-workspace=sky]');
  check('Laboratuvar ↔ Canlı Gökyüzü geçişi aynı gökyüzü motorunda kalır (motor yeniden kurulmaz)', await page.evaluate(() => window.LS19.mode === 'sky' && window.LS19.view === 'sky'));
  check('konsol hatası yok (alan geçişleri)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ================================================================= yeni deneyler: iniş tezgâhı, asteroit → Dünya, uydu ↔ uydu/çöp, yeniden giriş
if (part('deneyler')) {
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 860 } }, '?mode=lab');
  // ---- Ay'a iniş tezgâhı
  await page.click('#lab-home [data-exp=inis]');
  await page.waitForSelector('#lab-inis .steps');
  check('iniş tezgâhı tembel yüklenir; Apollo 11 LM hazır değerleri ve türetilen Δv kapasitesi (2.389 m/s = 3.050 ln(15.100/6.900))', await page.evaluate(() => document.querySelector('#lab-inis [data-preset=apollo11]').classList.contains('on') && /2\.389 m\/s/.test(document.querySelector('#lab-inis [data-f=vehOut]').textContent)) && (await txt(page, '#labTitle')) === "Ay'a iniş tezgâhı");
  await openStep(page, 'inis', 2);
  check('başlangıç koşulu: yerel dairesel hız, perilune ve ideal Δv (enerji alt sınırı)', await page.evaluate(() => { const t = document.querySelector('#lab-inis [data-f=icOut]').textContent; return /dairesel hız/.test(t) && /perilune/.test(t) && /İdeal Δv/.test(t); }));
  await openStep(page, 'inis', 3); await shot(page, 'd1-inis-gudum');
  await page.click('#lab-inis [data-f=run]');
  await page.waitForFunction(() => document.querySelector('#lab-inis .steps > li:nth-child(4)').classList.contains('open') && document.querySelector('#lab-inis .verdict'), null, { timeout: 280000 });
  const L1 = await page.evaluate(() => ({ v: document.querySelector('#lab-inis .verdict').className + ' ' + document.querySelector('#lab-inis .verdict .vt').textContent, rows: document.querySelectorAll('#lab-inis [data-f=out] tr').length, t: document.querySelector('#lab-inis [data-f=out]').textContent }));
  await page.waitForTimeout(400);
  const ink1 = await inked(page, '#lab-inis [data-f=out] canvas');
  check('ZEM/ZEV: güvenli iniş, Δv bütçesi (ideal + kayıp), fazlar ve 6 grafik çizildi', /good/.test(L1.v) && /Güvenli iniş/.test(L1.v) && /Çekim \+ yönlendirme kaybı/.test(L1.t) && /frenleme/.test(L1.t) && ink1.length === 6 && ink1.every((n) => n > 100), `${L1.v} · ${L1.rows} satır · mürekkep ${ink1.join('/')}`);
  await shot(page, 'd2-inis-sonuc');
  await openStep(page, 'inis', 3); await page.check('#lab-inis input[name=lbLaw][value=cmp]'); await page.click('#lab-inis [data-f=run]');
  await page.waitForFunction(() => document.querySelector('#lab-inis .tbl.cmp') && document.querySelector('#lab-inis .steps > li:nth-child(4)').classList.contains('open'), null, { timeout: 280000 });
  const cmp = await page.evaluate(() => { const rows = [...document.querySelectorAll('#lab-inis .tbl.cmp tr')].map((tr) => [...tr.children].map((c) => c.textContent)); return rows; });
  const fuel = cmp.find((r) => r[0] === 'Yakıt (kg)'), nf = (x) => +x.replace(/\./g, '').replace(',', '.');
  check('üç yasa karşılaştırması: tablo + yakıt-optimal ZEM/ZEV\'den az yakıt, sabit irtifa frenleme en çok kayıp', cmp[0].length === 4 && fuel && nf(fuel[2]) < nf(fuel[1]) && nf(cmp.find((r) => r[0] === 'Kayıp Δv (m/s)')[3]) > nf(cmp.find((r) => r[0] === 'Kayıp Δv (m/s)')[1]), JSON.stringify(fuel));
  await shot(page, 'd3-inis-karsilastirma');
  await openStep(page, 'inis', 1); await page.fill('#lab-inis [data-f=thrMin]', '60');
  check('girdi değişince: kısma uyarısı (askıda kalınamaz) ve "sonuç eski" bandı', await page.evaluate(() => /askıda kalınamaz/.test(document.querySelector('#lab-inis [data-f=vehOut]').textContent) && !document.querySelector('#lab-inis [data-f=stale]').hidden && !document.querySelector('#lab-inis [data-preset=apollo11]').classList.contains('on')));
  await page.click('#labBack');

  // ---- asteroit → Dünya
  await page.waitForFunction(() => window.LS19.asts && window.LS19.asts.n > 0, null, { timeout: 120000 });
  await page.click('#lab-home [data-exp=carpma]'); await page.waitForSelector('#lab-carpma .plist .prow');
  const n0 = await txt(page, '#lab-carpma .pk-count');
  await page.click('#lab-carpma [data-flag=pha]'); await page.waitForTimeout(150);
  const sen = await page.evaluate(() => ({ c: document.querySelector('#lab-carpma .pk-count').textContent, rows: document.querySelectorAll('#lab-carpma .prow').length, badges: document.querySelectorAll('#lab-carpma .prow .badge.warn').length }));
  check('asteroit seçici: tüm katalog listelenmez (≤ 40 satır); "Yalnız PHA" süzgeci daraltır', sen.rows <= 40 && sen.rows === sen.badges && sen.rows > 0 && n0 !== sen.c, `${n0.split(' ')[0]} → ${sen.c.split(' ')[0]}`);
  await page.click('#lab-carpma [data-flag=pha]');
  await page.fill('#lab-carpma [data-pk=q]', 'Apophis'); await page.waitForTimeout(150);
  await page.click('#lab-carpma .prow');
  check('Apophis seçilince: sınıf, çap, MOID ve Öpik karşılaşma hızı; çap/yoğunluk/hız önerilir', await page.evaluate(() => { const t = document.querySelector('#lab-carpma [data-f=astInfo]').textContent; return /Apophis/.test(t) && /MOID/.test(t) && /Öpik/.test(t) && +document.querySelector('#lab-carpma [data-f=L0]').value > 100 && +document.querySelector('#lab-carpma [data-f=v]').value > 11.2; }));
  await shot(page, 'd4-carpma-hedef');
  await page.click('#lab-carpma [data-f=next1]'); await page.click('#lab-carpma [data-f=run]');
  await page.waitForSelector('#lab-carpma [data-f=out] .verdict'); await page.waitForTimeout(400);
  const I1 = await page.evaluate(() => ({ vt: document.querySelector('#lab-carpma .verdict .vt').textContent, t: document.querySelector('#lab-carpma [data-f=out]').textContent }));
  const inkI = await inked(page, '#lab-carpma [data-f=out] canvas');
  check('Apophis çarpsaydı: krater, enerji (Mt), sismik, hava şoku, hasar yarıçapları ve grafikler', /krater/.test(I1.vt) && /Mt TNT/.test(I1.t) && /Deprem büyüklüğü/.test(I1.t) && /Hasar yarıçapları/.test(I1.t) && inkI.length >= 3 && inkI.every((n) => n > 100), `${I1.vt} · grafik ${inkI.join('/')}`);
  await shot(page, 'd5-carpma-sonuc');
  await openStep(page, 'carpma', 1); await page.check('#lab-carpma input[name=imSrc][value=el]');
  for (const [k, v] of [['L0', 18], ['rho', 3300], ['v', 19.16], ['theta', 18], ['rKm', 40]]) await page.fill(`#lab-carpma [data-f=${k}]`, String(v));
  await page.click('#lab-carpma [data-f=run]'); await page.waitForTimeout(300);
  const I2 = await txt(page, '#lab-carpma .verdict .vt');
  const zb = +(I2.match(/([\d,]+) km/) || [0, '0'])[1].replace(',', '.');
  check('elle Çelyabinsk benzeri (18 m, 19 km/s, 18°): hava patlaması ~25–35 km (gözlem 29,7 km)', /Hava patlaması/.test(I2) && zb > 25 && zb < 35, I2);

  // ---- uydu ↔ uydu / çöp
  await page.click('#labBack'); await page.click('#lab-home [data-exp=yakin]');
  await page.waitForFunction(() => document.querySelectorAll('#lab-yakin [data-f=pickA] .prow').length > 0, null, { timeout: 120000 });
  check('uydu seçici: katalog süzgeçli (≤ 40 satır, sayaç)', await page.evaluate(() => document.querySelectorAll('#lab-yakin [data-f=pickA] .prow').length <= 40 && /süzgeçten geçiyor/.test(document.querySelector('#lab-yakin [data-f=pickA] .pk-count').textContent)));
  await page.fill('#lab-yakin [data-f=pickA] [data-pk=q]', '25544'); await page.waitForTimeout(150);
  await page.click('#lab-yakin [data-f=pickA] .prow');
  check('NORAD numarasıyla birincil: ISS (ZARYA); 2. adım açılır', (await txt(page, '#lab-yakin [data-f=infoA]')).includes('ISS (ZARYA)') && (await stepOf(page, 'yakin')) === 2);
  await page.click('#lab-yakin [data-f=pickB] [data-src=cop]');
  await page.waitForFunction(() => /süzgeçten geçiyor/.test(document.querySelector('#lab-yakin [data-f=pickB] .pk-count').textContent), null, { timeout: 60000 });
  check('çöp bulutu kaynağı istek üzerine yüklenir (Cosmos 2251)', await page.evaluate(() => /COSMOS-2251 DEB/.test(document.querySelector('#lab-yakin [data-f=pickB] .plist').textContent)));
  await page.click('#lab-yakin [data-f=pickB] [data-src=aktif]');
  await page.check('#lab-yakin input[name=cjMode][value=tara]'); await page.fill('#lab-yakin [data-f=gate]', '300');
  await page.click('#lab-yakin [data-f=find]');
  await page.waitForFunction(() => document.querySelectorAll('#lab-yakin [data-f=events] .cacard').length > 0 || /yok|başarısız/.test(document.querySelector('#lab-yakin [data-f=events]').textContent + document.querySelector('#lab-yakin [data-f=status]').textContent), null, { timeout: 280000 });
  const fi = await page.evaluate(() => ({ info: document.querySelector('#lab-yakin [data-f=foundInfo]').textContent, n: document.querySelectorAll('#lab-yakin [data-f=events] .cacard').length }));
  check('süzgeçli tarama (iş parçacığı): apoje/perije süzgeci, kenetli modüller ayıklandı, yaklaşma kartları', fi.n > 0 && /apoje\/perije/.test(fi.info) && /ayıklandı/.test(fi.info), fi.info);
  await shot(page, 'd6-yakin-tarama');
  await page.click('#lab-yakin [data-f=next2]'); await page.click('#lab-yakin [data-f=eval]');
  await page.waitForSelector('#lab-yakin [data-f=out] .verdict'); await page.waitForTimeout(400);
  const C1 = await page.evaluate(() => ({ vt: document.querySelector('#lab-yakin .verdict .vt').textContent, t: document.querySelector('#lab-yakin [data-f=out]').textContent }));
  const inkC = await inked(page, '#lab-yakin [data-f=out] canvas');
  check('değerlendirme: Pc (Foster) + en kötü durum, RTN, EMR/parça sayısı, 5 grafik (düzlem, uzaklık, seyrelme, N(Lc), Gabbard)', /^Pc = /.test(C1.vt) && /RTN bileşenleri/.test(C1.t) && /Alfano/.test(C1.t) && /EMR/.test(C1.t) && inkC.length === 5 && inkC.every((n) => n > 50), `${C1.vt} · ${inkC.join('/')}`);
  await shot(page, 'd7-yakin-sonuc');
  await page.click("#lab-yakin button:has-text(\"3B'de TCA'ya git\")");
  check('"3B\'de TCA\'ya git": gökyüzü saati TCA\'dan 90 s önceye, kamera birincili izler', await page.waitForFunction(() => window.LS19.world.cam.mode === 'FOCUS' && Math.abs(window.LS19.clock.nowMs() - (window.LS19.labui.exps.yakin.res.tca - 90e3)) < 20e3, null, { timeout: 20000 }).then(() => true, () => false));
  await page.waitForTimeout(1200); await shot(page, 'd8-yakin-3b');

  // ---- yeniden giriş
  await page.click('#labBack'); await page.click('#lab-home [data-exp=giris]');
  await page.waitForFunction(() => document.querySelectorAll('#lab-giris .prow').length > 0, null, { timeout: 60000 });
  check('yeniden giriş seçicisi alçak yörünge süzgeciyle açılır (LEO, apoje ≤ 1.200 km)', await page.evaluate(() => document.querySelector('#lab-giris [data-pk=otype]').value === 'leo' && +document.querySelector('#lab-giris [data-pk=haMax]').value === 1200));
  await page.fill('#lab-giris [data-pk=q]', 'ISS (ZARYA)'); await page.waitForTimeout(150); await page.click('#lab-giris .prow');
  await page.click('#lab-giris [data-f=next1]');
  check("BC GP'nin B*'ından türetilir", /B\* = /.test(await txt(page, '#lab-giris [data-f=bcTxt]')), await txt(page, '#lab-giris [data-f=bcTxt]'));
  await page.check('#lab-giris input[name=rnBc][value=fiz]'); await page.fill('#lab-giris [data-f=m]', '420000'); await page.fill('#lab-giris [data-f=A]', '1360'); await page.fill('#lab-giris [data-f=Cd]', '2.2');
  await page.click('#lab-giris [data-f=run]');
  await page.waitForSelector('#lab-giris [data-f=out] .verdict', { timeout: 280000 }); await page.waitForTimeout(400);
  const R1 = await page.evaluate(() => ({ vt: document.querySelector('#lab-giris .verdict .vt').textContent, vd: document.querySelector('#lab-giris .verdict .vd').textContent, t: document.querySelector('#lab-giris [data-f=out]').textContent }));
  const inkR = await inked(page, '#lab-giris [data-f=out] canvas');
  check('ISS (BC ≈ 140 kg/m², itkisiz): ömür, Güneş etkinliğine göre pencere, giriş yükleri, enlem bandı ve 4 grafik', /Yörünge ömrü/.test(R1.vt) && /arasında/.test(R1.vd) && /En büyük yavaşlama/.test(R1.t) && /±51/.test(R1.t) && inkR.length === 4 && inkR.every((n) => n > 50), `${R1.vt} · ${R1.vd.slice(0, 90)}`);
  await shot(page, 'd9-giris-sonuc');
  check('konsol hatası yok (yeni deneyler)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ================================================================= telefon
if (part('telefon')) {
  const { ctx, page, errors } = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, '?sats=0&mode=lab');
  check('telefon: Laboratuvar paneli kendiliğinden açılır, iki alanlı üst çubuk 390 px\'e sığar (yatay taşma yok)', await page.evaluate(() => { const m = document.querySelector('#modebar').getBoundingClientRect(); return document.querySelector('#labPanel').classList.contains('open') && m.left >= 0 && m.right <= innerWidth + 0.5 && document.documentElement.scrollWidth <= innerWidth; }));
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
  await page.click('#btnSkyPanel'); await page.click('#labBack'); await page.click('#lab-home [data-exp=inis]'); await page.waitForSelector('#lab-inis .steps');
  await page.click('#lab-inis [data-preset=robotik]'); await openStep(page, 'inis', 3); await page.click('#lab-inis [data-f=run]');
  await page.waitForFunction(() => document.querySelector('#lab-inis .verdict'), null, { timeout: 280000 }); await page.waitForTimeout(500);
  check('telefon: iniş tezgâhı sonucu paneli yatay taşırmaz', await page.evaluate(() => { const p = document.querySelector('#lab-inis'); return p.scrollWidth <= p.clientWidth + 1; }));
  await shot(page, 'm6-inis');
  check('konsol hatası yok (telefon)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
const bad = res.filter((x) => !x).length;
console.log(bad ? `\n${bad} HATA` : `\nTüm denetimler geçti (ekran görüntüleri: ${outDir})`);
process.exit(bad ? 1 : 0);
