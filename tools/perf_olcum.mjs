// Tarayıcıda performans ölçümü (docs/performans.md'deki sayıların kaynağı). Playwright + Chromium gerekir (depoya bağımlılık olarak eklenmemiştir):
//   npm i -g playwright-core   (ve bir Chromium: CHROME=/yol/chrome ya da `npx playwright install chromium`)
//   cd web && python3 sunucu.py &            # ya da: python3 -m http.server 8765
//   node tools/perf_olcum.mjs yukleme [adres]   açılış zaman çizelgesi: yükleme iletileri, uzun görevler (>50 ms), ilk çizim kareleri arası
//   node tools/perf_olcum.mjs cizim   [adres]   kamera kiplerine göre çizim çağrısı, üçgen, geometri, program sayıları (renderer.info)
//   node tools/perf_olcum.mjs kare    [adres]   ısınmış JIT ile kare başına JS süresi: world.update ve ui.hud (park, LLO, motorlu iniş × araç/Dünya/Ay kamerası)
// Seçenekler: --gpu (yazılım çizimi SwiftShader yerine gerçek GPU; varsayılan SwiftShader: GPU'suz makinelerde de çalışır, JS ve çağrı sayıları güvenilir, GPU süreleri değildir)
//             --genis=800 --yuksek=450 (görünüm boyutu)   Varsayılan adres: http://127.0.0.1:8765/
// Karşılaştırma (önce/sonra): iki ağacı iki kapıdan sunup aynı komutu iki adresle çalıştırın.
const arg = process.argv.slice(2), mod = arg[0] || 'yukleme', gpu = arg.includes('--gpu');
const opt = (k, d) => { const a = arg.find((x) => x.startsWith('--' + k + '=')); return a ? +a.split('=')[1] : d; };
const base = (arg.find((x) => /^https?:/.test(x)) || 'http://127.0.0.1:8765/').replace(/\/?$/, '/'), W = opt('genis', 800), H = opt('yuksek', 450);
let chromium; try { ({ chromium } = await import('playwright-core')); } catch (e) { console.error('playwright-core yok: npm i -g playwright-core (bkz. dosya başı)'); process.exit(2); }
const args = ['--no-sandbox', ...(gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'])];
const browser = await chromium.launch({ headless: true, args, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage(); const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!/ERR_CERT|ERR_TUNNEL|Failed to load resource|net::ERR/.test(t)) errors.push('console: ' + t.slice(0, 200)); } });
await page.addInitScript(() => {
  try { localStorage.clear(); localStorage.setItem('ls19.vehicle', 'two'); localStorage.setItem('ls19.landing', 'opt'); } catch (e) { /* */ }
  const L = window.__L = { msgs: [], long: [] };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) L.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ entryTypes: ['longtask'] }); } catch (e) { /* */ }
  document.addEventListener('DOMContentLoaded', () => { const el = document.querySelector('#loadMsg'); if (el) new MutationObserver(() => L.msgs.push([Math.round(performance.now()), el.textContent])).observe(el, { childList: true, characterData: true, subtree: true }); });
});
const t0 = Date.now();
await page.goto(base + 'index.html?sats=0&ast=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const l = document.querySelector('#loading'); return l && getComputedStyle(l).display === 'none'; }, null, { timeout: 280000 });
const tClose = await page.evaluate(() => Math.round(performance.now()));

if (mod === 'yukleme') {
  const fr = await page.evaluate(() => new Promise((res) => { const ts = []; const f = (t) => { ts.push(Math.round(t)); if (ts.length < 8) requestAnimationFrame(f); else res(ts); }; requestAnimationFrame(f); }));
  const R = await page.evaluate(() => ({ msgs: window.__L.msgs, long: window.__L.long }));
  console.log(`#loading kapandı: ${tClose} ms (duvar ${((Date.now() - t0) / 1000).toFixed(1)} s) — ${R.long.length} uzun görev, en uzunu ${Math.max(0, ...R.long.map((x) => x[1]))} ms, toplam ${R.long.reduce((a, b) => a + b[1], 0)} ms`);
  for (const [t, k, v] of [...R.msgs.map(([t, m]) => [t, 'msg', m]), ...R.long.map(([t, d]) => [t, 'long', d])].sort((a, b) => a[0] - b[0])) console.log(String(t).padStart(7), k === 'long' ? `   ██ uzun görev ${v} ms` : v);
  console.log('ilk çizim kareleri arası (ms):', JSON.stringify(fr.slice(1).map((t, i) => t - fr[i])));
} else {
  const plan = await page.evaluate(() => Object.fromEntries(window.LS19.ui.plan.map((p) => [p.key, p.t])));
  const SC = { park: plan.INS + 600, llo: plan.LOI + 600, indis: plan.PDI + 100, transfer: plan['MCC-1'] + 600 };
  const CAMS = { 'VEHICLE': { mode: 'VEHICLE', dist: 0.06, el: 0.2, az: -2.3 }, 'EARTH': { mode: 'EARTH', dist: 30000, el: 0.35, az: 0.4 }, 'MOON': { mode: 'MOON', dist: 8000, el: 0.35, az: 0.6 },
    'SYSTEM': { mode: 'SYSTEM', dist: 900000, el: 1.05, az: -1.2 }, 'SOLAR': { mode: 'SOLAR', dist: 6e8, el: 1.2, az: -1.0 } };
  const seek = async (t, wait) => { await page.evaluate((tt) => window.LS19.send({ cmd: 'seek', t: tt }), t); await page.waitForTimeout(wait); await page.evaluate(() => window.LS19.setPlay(false)); await page.waitForTimeout(800); };
  if (mod === 'cizim') {
    await seek(SC.transfer, 6000);
    for (const [ad, cam] of Object.entries(CAMS)) {
      const r = await page.evaluate(async (c) => { const w = window.LS19.world; w.cam.auto = false; Object.assign(w.cam, c, { focus: null }); await new Promise((res) => setTimeout(res, 7000));
        const i = w.renderer.info; return { cagri: i.render.calls, ucgen: i.render.triangles, cizgi: i.render.lines, geometri: i.memory.geometries, doku: i.memory.textures, program: (i.programs || []).length }; }, cam);
      console.log(ad.padEnd(8), JSON.stringify(r));
    }
  } else if (mod === 'kare') {
    const N = opt('n', 300);
    for (const sc of ['park', 'llo', 'indis']) {
      await seek(SC[sc], sc === 'indis' ? 10000 : 6000);
      for (const [ad, cam] of Object.entries({ VEHICLE: CAMS.VEHICLE, EARTH: CAMS.EARTH, MOON: CAMS.MOON })) {
        const r = await page.evaluate(([c, N]) => {
          const L = window.LS19, w = L.world, ui = L.ui, x = ui.lastS; w.cam.auto = false; Object.assign(w.cam, c, { focus: null });
          const ex = { dtReal: 0.016, stage: x.stage, debris: x.debris, local: x.local, drAxis: x.drAxis }; for (let i = 0; i < 60; i++) w.update(x, ex);                      // ısınma
          let tw = 0, th = 0, now = performance.now();
          for (let i = 0; i < N; i++) { let a = performance.now(); w.update(x, ex); tw += performance.now() - a; if (i % 6 === 0) { a = performance.now(); for (let k = 0; k < 6; k++) { now += 120; ui.hud(x, now); } th += performance.now() - a; } }
          return { 'world.update': tw / N, 'ui.hud': th / N, toplam: (tw + th) / N };
        }, [cam, N]);
        console.log(`${sc.padEnd(6)} ${ad.padEnd(8)} world.update ${r['world.update'].toFixed(3)} ms · ui.hud ${r['ui.hud'].toFixed(3)} ms · toplam ${r.toplam.toFixed(3)} ms/kare`);
      }
    }
  } else { console.error('mod: yukleme | cizim | kare'); process.exit(2); }
}
console.log('HATALAR:', errors.length ? [...new Set(errors)].slice(0, 6).join(' | ') : 'yok');
await browser.close();
