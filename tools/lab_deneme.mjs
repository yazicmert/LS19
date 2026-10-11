// Laboratuvar arayüzü tarayıcı denemesi (başsız Chromium): üç dallı gezinme, Saptırma deneyinin 4 adımı (hedef → yakın geçiş → itki → sonuç),
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
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/ERR_CERT|ERR_TUNNEL|Failed to load resource|net::ERR/.test(t)) errors.push('console: ' + t.slice(0, 200)); });
  await page.route('**/api/**', api);
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

// ================================================================= masaüstü
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } }, '?sats=0&mode=lab');
  await page.waitForFunction(() => window.LS19.asts && window.LS19.asts.n > 0, null, { timeout: 120000 });
  check('üç dallı üst çubuk: Ay Görevi · Canlı Gökyüzü · Laboratuvar (Laboratuvar etkin)', await page.evaluate(() => { const b = [...document.querySelectorAll('#modebar [data-workspace]')]; return b.map((x) => x.dataset.workspace).join() === 'mission,sky,lab' && b[2].classList.contains('on') && document.body.dataset.mode === 'lab'; }));
  check('Laboratuvar paneli görünür; Canlı Gökyüzü paneli ve saati gizli', (await vis(page, '#labPanel')) && !(await vis(page, '#skyPanel')) && !(await vis(page, '#skyHud')) && !(await vis(page, '#panel')));
  check('zaman/kamera çubuğu laboratuvarda da var', await vis(page, '#skyControls'));
  check('deney merkezi ağacı: 3 dal (Asteroit saptırma, Ay görevi, Çarpma riski)', await page.evaluate(() => [...document.querySelectorAll('#lab-home .exp')].map((b) => b.querySelector('b').textContent).join('|') === 'Asteroit saptırma|Ay görevi|Çarpma riski'));
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
  check('"Ay görevi" kısayolu Ay Görevi alanını ve Görev sekmesini açar', await page.evaluate(() => window.LS19.view === 'mission' && document.body.dataset.mode === 'mission' && !document.querySelector('#tab-gorev').hidden));
  await page.keyboard.press('m'); check('M kısayolu alanlar arasında döner: Ay Görevi → Canlı Gökyüzü', await page.evaluate(() => window.LS19.view === 'sky'));
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
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 800 } }, '?sats=0&ast=0&mode=lab&exp=saptirma');
  check('?mode=lab&exp=saptirma doğrudan Laboratuvar › Asteroit saptırma\'yı açar', await page.evaluate(() => window.LS19.view === 'lab' && window.LS19.labui.page === 'saptirma' && document.querySelector('#labTitle').textContent === 'Asteroit saptırma'));
  check('katalog kapalıyken (?ast=0) hızlı seçim çipleri etkisiz, durum satırı bilgi verir', await page.evaluate(() => [...document.querySelectorAll('#dfQuick .chip')].every((c) => c.disabled) && document.querySelector('#dfCatalog').textContent.length > 3));
  await page.goto(base + 'index.html?sats=0&ast=0&tab=saptirma', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
  check('eski adres ?tab=saptirma Laboratuvar › Asteroit saptırma\'yı açar', await page.evaluate(() => window.LS19.view === 'lab' && window.LS19.labui.page === 'saptirma'));
  await page.goto(base + 'index.html?sats=0&ast=0', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
  check('varsayılan açılış Ay Görevi: HUD ve panel görünür, Laboratuvar paneli gizli, düğme etkin', (await vis(page, '#hud')) && (await vis(page, '#panel')) && !(await vis(page, '#labPanel')) && await page.evaluate(() => document.querySelector('[data-workspace=mission]').classList.contains('on') && window.LS19.view === 'mission'));
  await page.click('[data-workspace=sky]');
  check('Canlı Gökyüzü: saat ve panel görünür, Laboratuvar paneli gizli', (await vis(page, '#skyHud')) && (await vis(page, '#skyPanel')) && !(await vis(page, '#labPanel')));
  await page.click('[data-workspace=lab]'); await page.click('[data-workspace=sky]');
  check('Laboratuvar ↔ Canlı Gökyüzü geçişi aynı gökyüzü motorunda kalır (motor yeniden kurulmaz)', await page.evaluate(() => window.LS19.mode === 'sky' && window.LS19.view === 'sky'));
  check('konsol hatası yok (alan geçişleri)', errors.length === 0, errors.slice(0, 3).join(' | '));
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
  check('konsol hatası yok (telefon)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
const bad = res.filter((x) => !x).length;
console.log(bad ? `\n${bad} HATA` : `\nTüm denetimler geçti (ekran görüntüleri: ${outDir})`);
process.exit(bad ? 1 : 0);
