// Gerçek cihaz yerine EMÜLASYON denetimi (başsız Chromium): telefon profili, Safari benzeri yedek yollar, GL hataları, bağlam kaybı, uyarlanır çözünürlük.
// Gerçek bir ekran kartı ya da telefon DEĞİLDİR: GPU/bellek/ısıl davranışı ve Safari'nin kendisi sınanamaz; burada sınanan, bu davranışlara karşı yazılmış mekanizmaların
// (düşük bellek katmanı, yedek yollar, bağlam kaybı, uyarlanır çözünürlük) bozulma biçimlerinde doğru çalıştığı ve görüntüyü bozmadığıdır. Sonuçlar: docs/performans.md §11.
//   node tools/cihaz_emulasyonu.mjs [senaryo ...] [adres] [--out=klasör] [--gpu]
// senaryolar: telefon iphone resize-yok safari r8-red baglam-kaybi uyarlanir uyarlanir-2   (varsayılan: hepsi; ekran görüntüleri --out klasörüne)
// Playwright + Chromium gerekir (bkz. perf_olcum.mjs): CHROME=/yol/chrome node tools/cihaz_emulasyonu.mjs telefon http://127.0.0.1:8765/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const arg = process.argv.slice(2), gpu = arg.includes('--gpu');
const outDir = (arg.find((a) => a.startsWith('--out=')) || '').slice(6) || path.join(os.tmpdir(), 'ls19-emu');
const base = (arg.find((a) => /^https?:/.test(a)) || 'http://127.0.0.1:8765/').replace(/\/?$/, '/');
let chromium; try { ({ chromium } = await import('playwright-core')); } catch (e) { console.error('playwright-core yok: npm i -g playwright-core (bkz. tools/perf_olcum.mjs)'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', ...(gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'])], ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const DESK = { viewport: { width: 800, height: 450 } }, Q = '?sats=0&ast=0';
// sayfa yüklenmeden çalışan taklitler (tarayıcı davranışları)
const ignoreOpts = (keys) => `(() => { const o = window.createImageBitmap; window.createImageBitmap = function (s, opt) { if (opt && typeof opt === 'object') { const c = { ...opt }; for (const k of ${JSON.stringify(keys)}) delete c[k]; return o.call(this, s, c); } return o.apply(this, arguments); }; })()`;
const NOWEBDRIVER = '(() => { Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }); })()';
const SC = {
  telefon: { ctx: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, userAgent: UA_ANDROID }, q: Q, init: '(() => { Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => 4 }); })()' },
  iphone: { ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA_IPHONE }, q: Q },
  'resize-yok': { ctx: DESK, q: Q + '&lowmem=1', init: ignoreOpts(['resizeWidth', 'resizeHeight', 'resizeQuality']) },       // createImageBitmap resize'ı yok sayar (flipY çalışır)
  safari: { ctx: DESK, q: Q + '&lowmem=1', init: ignoreOpts(['imageOrientation']) },                                              // flipY'yi sessizce yok sayar → yoklama başarısız → <img> yolu
  'r8-red': { ctx: DESK, q: Q, init: '(() => { const p = WebGL2RenderingContext.prototype, o = p.texSubImage2D; p.texSubImage2D = function (...a) { if (a.length === 7 && a[4] === this.RED && a[6] instanceof ImageBitmap) { window.__r8 = (window.__r8 || 0) + 1; return o.call(this, a[0], a[1], -1, -1, a[4], a[5], a[6]); } return o.apply(this, a); }; })()' },
  'baglam-kaybi': { ctx: DESK, q: Q },
  uyarlanir: { ctx: { viewport: { width: 320, height: 240 }, deviceScaleFactor: 2 }, q: Q, init: NOWEBDRIVER },
  'uyarlanir-2': { ctx: { viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 }, q: Q, init: NOWEBDRIVER },
};
const wanted = arg.filter((a) => SC[a]), list = wanted.length ? wanted : Object.keys(SC);
const res = []; const check = (sc, name, ok, d = '') => { res.push(ok); console.log(`${ok ? 'TAMAM' : 'HATA '} [${sc}] ${name}${d ? ' — ' + d : ''}`); };

async function open(S) {
  const ctx = await browser.newContext(S.ctx), page = await ctx.newPage(), errors = []; page.setDefaultNavigationTimeout(240000); page.setDefaultTimeout(240000);
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/ERR_CERT|ERR_TUNNEL|Failed to load resource|net::ERR/.test(t)) errors.push('console: ' + t.slice(0, 160)); });
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('ls19.vehicle', 'two'); localStorage.setItem('ls19.landing', 'opt'); } catch (e) { /* */ } });
  if (S.init) await page.addInitScript(S.init);
  await page.goto(base + 'index.html' + S.q, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
  return { ctx, page, errors };
}
const info = (page) => page.evaluate(() => {
  const w = window.LS19.world, sz = (t) => t && t.userData && t.userData.size;
  return { lowMem: w.lowMem, dpr: devicePixelRatio, prMax: w.prMax, buf: [w.canvas.width, w.canvas.height], css: [w.canvas.clientWidth, w.canvas.clientHeight], day: sz(w.earthU.dayMap.value), clouds: sz(w.earthU.cloudMap.value), cloudsFmt: w.earthU.cloudMap.value.format,
    mcol: sz(w.moonU.colorMap.value), mnorm: sz(w.moonU.normalMap.value), mh: sz(w.moonU.heightMap.value), stars: sz(w.stars.material.map), flipY: w.earthU.dayMap.value.flipY, img: w.earthU.dayMap.value.image && w.earthU.dayMap.value.image.constructor.name };
});
// sabit görünüm: park yörüngesi, aydınlık Dünya yüzü; ekran görüntüsü tampon döndürür
async function park(page, name) {
  await page.evaluate(async () => { const L = window.LS19, w = L.world, plan = Object.fromEntries(L.ui.plan.map((p) => [p.key, p.t])); L.send({ cmd: 'autoWarp', on: false }); L.send({ cmd: 'warp', value: 0.05 }); L.send({ cmd: 'seek', t: plan.INS + 900 });
    await new Promise((r) => setTimeout(r, 6000)); L.setPlay(false); w.cam.auto = false; Object.assign(w.cam, { mode: 'EARTH', dist: 30000, focus: null, userFov: false }); const sd = w.earthU.sunDir.value;
    Object.assign(w.cam, { az: Math.atan2(sd.y, sd.x) + 0.45, el: Math.asin(Math.max(-0.9, Math.min(0.9, sd.z))) + 0.1 }); });
  await page.waitForTimeout(5000);
  return page.screenshot({ path: path.join(outDir, name + '.png'), timeout: 200000 });
}
// iki PNG'nin piksel farkı (tarayıcı tuvaliyle): ortalama |fark| ve > 24 olan piksel oranı
async function diff(a, b) {
  const pg = await browser.newPage(); await pg.setContent('<body></body>');
  const r = await pg.evaluate(async ([x, y]) => { const ld = async (u) => { const bm = await createImageBitmap(await (await fetch(u)).blob()), c = new OffscreenCanvas(bm.width, bm.height), g = c.getContext('2d'); g.drawImage(bm, 0, 0); return g.getImageData(0, 0, bm.width, bm.height); };
    const [p, q] = [await ld(x), await ld(y)]; if (p.width !== q.width || p.height !== q.height) return { err: 1 }; let s = 0, big = 0; const N = p.width * p.height;
    for (let i = 0; i < N; i++) { const d = Math.max(Math.abs(p.data[i * 4] - q.data[i * 4]), Math.abs(p.data[i * 4 + 1] - q.data[i * 4 + 1]), Math.abs(p.data[i * 4 + 2] - q.data[i * 4 + 2])); s += d; if (d > 24) big++; } return { mean: s / N, big: 100 * big / N }; },
  ['data:image/png;base64,' + a.toString('base64'), 'data:image/png;base64,' + b.toString('base64')]);
  await pg.close(); return r;
}
const refShots = {};                                                                                          // başvuru görüntüleri (bir kez)
async function ref(kind) {
  if (refShots[kind]) return refShots[kind];
  const { ctx, page } = await open({ ctx: DESK, q: Q + (kind === 'dusuk' ? '&lowmem=1' : '') });
  refShots[kind] = await park(page, 'basvuru-' + kind); await ctx.close(); return refShots[kind];
}
const okSize = (s, w, h) => !!s && s[0] === w && s[1] === h;

for (const sc of list) {
  const S = SC[sc]; console.log(`\n== ${sc}`);
  const { ctx, page, errors } = await open(S);
  let I = await info(page);
  if (sc === 'telefon' || sc === 'iphone') {
    check(sc, 'düşük bellek katmanı adres parametresi olmadan kendiliğinden açılır (mobil UA' + (sc === 'telefon' ? ' + deviceMemory 4' : '') + ')', I.lowMem === true);
    check(sc, 'ana haritalar 4096×2048, Ay normal haritası 2880×1440, LOLA yükseklik haritası dokunulmamış (2880×1440)', okSize(I.day, 4096, 2048) && okSize(I.clouds, 4096, 2048) && okSize(I.mcol, 4096, 2048) && okSize(I.stars, 4096, 2048) && okSize(I.mnorm, 2880, 1440) && okSize(I.mh, 2880, 1440), JSON.stringify([I.day, I.mnorm, I.mh]));
    const pr = Math.min(I.dpr, 2); check(sc, `çizim tamponu = CSS boyutu × min(DPR, 2): ${I.css.join('×')} × ${pr}`, I.buf[0] === Math.round(I.css[0] * pr) && I.buf[1] === Math.round(I.css[1] * pr), `${I.buf.join('×')}`);
    await park(page, sc + '-park'); await page.click('#btnPanel').catch(() => {}); await page.waitForTimeout(2500); await page.screenshot({ path: path.join(outDir, sc + '-panel.png'), timeout: 200000 });
  } else if (sc === 'resize-yok') {
    check(sc, 'tarayıcı resize seçeneğini yok sayınca da düşük bellek katmanı etkin: tuvalle küçültülür (4096×2048)', okSize(I.day, 4096, 2048) && okSize(I.mcol, 4096, 2048) && okSize(I.mnorm, 2880, 1440) && I.img === 'ImageBitmap', JSON.stringify([I.day, I.mnorm, I.img]));
    const shot = await park(page, sc + '-park'); await ctx.close(); ctx.__closed = true;
    const d = await diff(shot, await ref('dusuk')); check(sc, 'görüntü, tarayıcının kendi küçültmesiyle çözülen düşük bellek katmanıyla aynı görünür', d.mean < 3 && d.big < 3, `ort. fark ${d.mean.toFixed(2)}, >24: %${d.big.toFixed(2)}`);
  } else if (sc === 'safari') {
    check(sc, 'flipY yoklaması başarısız → <img> yolu: doku ters değil (flipY=true), RGBA, düşük bellek katmanı yine etkin (4096×2048)', I.flipY === true && I.cloudsFmt === 1023 && okSize(I.day, 4096, 2048) && okSize(I.mcol, 4096, 2048) && /Canvas|Image/.test(I.img), JSON.stringify([I.img, I.flipY, I.cloudsFmt, I.day]));
    const shot = await park(page, sc + '-park'); await ctx.close(); ctx.__closed = true;
    const d = await diff(shot, await ref('dusuk')); check(sc, 'görüntü ters/bozuk değil: bitmap yoluyla çözülen düşük bellek katmanıyla aynı görünür', d.mean < 3 && d.big < 3, `ort. fark ${d.mean.toFixed(2)}, >24: %${d.big.toFixed(2)}`);
  } else if (sc === 'r8-red') {
    const n = await page.evaluate(() => window.__r8 || 0);
    check(sc, 'R8 yüklemesi GL hatası verince (sürücü reddi) doku RGBA olarak yeniden yüklenir', n >= 2 && I.cloudsFmt === 1023, `${n} R8 denemesi, bulut biçimi ${I.cloudsFmt}`);
    const shot = await park(page, sc + '-park'); await ctx.close(); ctx.__closed = true;
    const d = await diff(shot, await ref('tam')); check(sc, 'bulutlar ve okyanus parıltısı yerinde: görüntü R8 yoluyla aynı', d.mean < 1 && d.big < 1, `ort. fark ${d.mean.toFixed(2)}, >24: %${d.big.toFixed(2)}`);
  } else if (sc === 'baglam-kaybi') {
    await page.evaluate(() => { window.__marker = Math.random(); window.__lc = window.LS19.world.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lc.loseContext(); });
    await page.waitForTimeout(1500);
    const lost = await page.evaluate(() => window.LS19.world.ctxLost === true), nav = page.waitForNavigation({ timeout: 90000 }).then(() => true).catch(() => false);
    await page.evaluate(() => window.__lc.restoreContext()); const reloaded = await nav;
    check(sc, 'bağlam kaybı yakalanır (preventDefault) ve geri gelince sayfa bir kez yenilenir', lost && reloaded);
    await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
    const m2 = await page.evaluate(() => { window.__marker = Math.random(); window.__lc = window.LS19.world.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lc.loseContext(); return window.__marker; });
    await page.waitForTimeout(1500); await page.evaluate(() => window.__lc.restoreContext()); await page.waitForTimeout(6000);
    const stay = (await page.evaluate(() => window.__marker)) === m2, lay = await page.evaluate(() => { const l = document.querySelector('#loading'); return { on: getComputedStyle(l).display !== 'none', msg: document.querySelector('#loadMsg').textContent, btn: document.querySelector('#loadBack').hidden ? null : document.querySelector('#loadBack').textContent }; });
    check(sc, '30 sn içinde ikinci kayıpta yenileme döngüsü yok; kullanıcıya "Sayfayı yenile" düğmesiyle bildirilir', stay && lay.on && /yenileyin/.test(lay.msg) && lay.btn === 'Sayfayı yenile', JSON.stringify(lay));
  } else {                                                                                                  // uyarlanır çözünürlük (SwiftShader yavaş GPU yerine; CPU/köşe işine bağlı olabilir)
    const plan = await page.evaluate(() => Object.fromEntries(window.LS19.ui.plan.map((p) => [p.key, p.t])));
    await page.evaluate((t) => { const L = window.LS19; L.send({ cmd: 'autoWarp', on: false }); L.send({ cmd: 'warp', value: 0.05 }); L.send({ cmd: 'seek', t }); }, plan['MCC-1'] + 600);
    await page.waitForTimeout(6000);
    await page.evaluate(() => { const L = window.LS19, w = L.world; L.setPlay(false); w.cam.auto = false; Object.assign(w.cam, { mode: 'VEHICLE', dist: 0.06, el: 0.2, az: -2.3, focus: null });
      window.__fr = []; let last = performance.now(); const f = (t) => { window.__fr.push([t, t - last]); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
    const tl = [], t1 = Date.now();
    while (Date.now() - t1 < (sc === 'uyarlanir' ? 170000 : 200000)) {
      await page.waitForTimeout(4000);
      tl.push(await page.evaluate(() => { const w = window.LS19.world, now = performance.now(), fr = window.__fr.filter((x) => now - x[0] < 4000).map((x) => x[1]).sort((a, b) => a - b); return { pr: w.renderer.getPixelRatio(), buf: [w.canvas.width, w.canvas.height], css: [w.canvas.clientWidth, w.canvas.clientHeight], med: fr.length ? Math.round(fr[fr.length >> 1]) : null }; }));
    }
    const prs = tl.map((x) => x.pr), changes = prs.filter((p, i) => i && p !== prs[i - 1]).length, inRange = prs.every((p) => p >= 1 && p <= I.prMax);
    const bufOk = tl.every((x) => x.buf[0] === Math.round(x.css[0] * x.pr) && x.buf[1] === Math.round(x.css[1] * x.pr));
    check(sc, 'oran [1, prMax] içinde kalır ve çizim tamponu her zaman CSS boyutu × oran', inRange && bufOk, `oranlar: ${[...new Set(prs)].join(' / ')}`);
    check(sc, 'salınım yok (3 dk\'da ≤ 6 oran değişikliği)', changes <= 6, `${changes} değişiklik; kare süresi (ms): ${[...new Set(tl.map((x) => x.med))].slice(0, 8).join(', ')}`);
    const lo = Math.min(...prs), meds = (r) => tl.filter((x) => x.pr === r).map((x) => x.med).filter(Boolean);
    const fillBound = lo < I.prMax && meds(lo).length && meds(I.prMax).length && Math.min(...meds(lo)) < 0.95 * Math.min(...meds(I.prMax));
    console.log(`   not: ${lo < I.prMax ? (fillBound ? 'oran düştü ve kare süresi iyileşti (doldurma oranına bağlı)' : 'oran düştü ama kare süresi iyileşmedi → denetleyici geri vermeli') : 'oran hiç düşmedi'}; son oran ${prs[prs.length - 1]}`);
    if (lo < I.prMax && !fillBound) check(sc, 'darboğaz piksel değilse (kare süresi iyileşmiyor) oran kalıcı düşük kalmaz: eski oran geri verilir', prs[prs.length - 1] === I.prMax, `son oran ${prs[prs.length - 1]}`);
    await page.screenshot({ path: path.join(outDir, sc + '-son.png'), timeout: 200000 });
  }
  check(sc, 'konsol hatası yok', errors.length === 0, errors.slice(0, 2).join(' | '));
  if (!ctx.__closed) await ctx.close();
}
await browser.close();
const bad = res.filter((x) => !x).length;
console.log(bad ? `\n${bad} HATA` : `\nTüm denetimler geçti (ekran görüntüleri: ${outDir})`);
process.exit(bad ? 1 : 0);
