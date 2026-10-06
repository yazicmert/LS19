// Uyarlanır çizim çözünürlüğü (perfgov.js) ve arka plan duraklatma doğrulaması (Node 20+): cd web && node test/test_perfgov.js
//  1) oran 1 ise (ya da min = max) denetleyici etkin değil
//  2) yavaş kareler (> 24 ms medyan) oranı kademe kademe düşürür, min'de durur; duraklama/sekme gibi > 250 ms kareler ölçüm sayılmaz
//  3) ekran hızında (≈ en iyi görülen medyan) ve bol payla oran geri çıkar, ama düşüşten sonra bekleme süresi geçmeden değil
//  4) GPU'ya bağlı sentetik maliyet modeli (süre ∝ oran², ekran 60 Hz): yakınsar, salınmaz (5 dk'da sınırlı sayıda değişiklik), hızlı makinede hiç düşmez
//  5) app.js bağlantıları: webdriver/?adapt=0/sinematik/tasarım/gizli sekmede kapalı; noktalar ekranda aynı boyda kalır (setPixelScale); gizli sekmede duraklat/sürdür
import fs from 'fs';
import { PixelGovernor } from '../js/perfgov.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');

// sentetik çizim döngüsü: kare süresi = max(ekran aralığı, c·oran²); governor'a beslenir, oran değişince maliyet hemen etkilenir
function simulate({ max = 2, c = 10, refresh = 1000 / 60, seconds = 300, jitter = 0.4 } = {}) {
  const g = new PixelGovernor({ max, min: 1 }); let now = 0, changes = 0, seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2; const hist = [];
  while (now < seconds * 1000) {
    const frame = Math.max(refresh, c * g.r * g.r) + jitter * rnd(); now += frame;
    const r = g.tick(frame, now); if (r) { changes++; hist.push([Math.round(now / 1000), r]); }
  }
  return { r: g.r, changes, hist };
}

// ---------------------------------------------------------------- 1) etkinlik
check('oran 1 ya da min = max ise denetleyici etkin değil (hiç değişiklik önermez)', !new PixelGovernor({ max: 1, min: 1 }).active && new PixelGovernor({ max: 1 }).tick(50, 0) === null
  && Array.from({ length: 200 }, (_, i) => new PixelGovernor({ max: 1 }).tick(60, i * 60)).every((x) => x === null));
check('oran 2 ise etkin, başlangıç oranı = max', new PixelGovernor({ max: 2 }).active && new PixelGovernor({ max: 2 }).r === 2);

// ---------------------------------------------------------------- 2) yavaş kareler oranı düşürür
{
  const g = new PixelGovernor({ max: 2, min: 1 }); let now = 0; const out = [];
  for (let i = 0; i < 40 * 8; i++) { now += 40; const r = g.tick(40, now); if (r) out.push(r); }
  check('yavaş kareler (40 ms): oran 0,25 kademelerle 2 → 1 düşer ve 1\'de durur', out.join() === '1.75,1.5,1.25,1' && g.r === 1, out.join(' → '));
  const g2 = new PixelGovernor({ max: 2 }); let n = 0;
  for (let i = 0; i < 300; i++) if (g2.tick(i % 7 === 0 ? 900 : 60, i * 60)) n++;
  check('> 250 ms kareler (duraklama/sekme) ölçüm penceresini sıfırlar: sürekli kesilen ölçüm değişiklik üretmez', n === 0);
  const g3 = new PixelGovernor({ max: 2 }); let n3 = 0; for (let i = 0; i < 500; i++) if (g3.tick(NaN, i) || g3.tick(0, i) || g3.tick(-5, i)) n3++;
  check('geçersiz kare süreleri (NaN, 0, negatif) yok sayılır', n3 === 0);
}

// ---------------------------------------------------------------- 3) geri çıkış: bekleme süresinden sonra, ekran hızında
{
  const g = new PixelGovernor({ max: 2, min: 1 }); let now = 0;
  const feed = (ms, n) => { const o = []; for (let i = 0; i < n; i++) { now += ms; const r = g.tick(ms, now); if (r) o.push([Math.round(now / 1000), r]); } return o; };
  feed(16.7, 40);                                                       // ekran hızı görüldü: taban = 16,7
  const down = feed(40, 40);                                            // yavaşladı: düşer
  const early = feed(16.7, 40 * 3);                                     // hemen toparlandı ama bekleme (15 sn) dolmadı: çıkmamalı (3 pencere ≈ 2 sn)
  check('düşüşten hemen sonra toparlansa bile bekleme süresi dolmadan çıkmaz', down.length === 1 && down[0][1] === 1.75 && early.length === 0, JSON.stringify([down, early]));
  now += 16000; const up = feed(16.7, 40 * 2);
  check('bekleme dolunca ve kare süresi ekran hızında/bol payla ise bir kademe yükselir (en çok pencere başına bir)', up.length >= 1 && up[0][1] === 2, JSON.stringify(up));
  const mid = new PixelGovernor({ max: 2 }); let t = 0; for (let i = 0; i < 40; i++) { t += 16.7; mid.tick(16.7, t); } mid.r = 1.5; mid.cool = 0;
  let u = null; for (let i = 0; i < 40; i++) { t += 21; u = mid.tick(21, t) || u; }
  check('kare süresi ekran hızına yakın değilse (21 ms; taban 16,7) yükselmez', u === null);
}

// ---------------------------------------------------------------- 4) GPU\'ya bağlı model: yakınsama, salınmama
{
  const heavy = simulate({ c: 10 }), light = simulate({ c: 3 }), mid = simulate({ c: 6, seconds: 600 });
  check('ağır sahne (40 ms @2×): oran düşer, ≥ 45 kare/sn veren orada kalır; 5 dk\'da değişiklik sayısı sınırlı', heavy.r <= 1.5 && heavy.r >= 1 && 10 * heavy.r * heavy.r <= 24 + 0.01 && heavy.changes <= 8, `oran ${heavy.r}, ${heavy.changes} değişiklik: ${JSON.stringify(heavy.hist.slice(0, 8))}`);
  check('hızlı makine (12 ms @2×): oran hiç düşmez', light.r === 2 && light.changes === 0);
  check('orta sahne (24 ms @2×): salınmaz (10 dk\'da ≤ 10 değişiklik)', mid.changes <= 10, `oran ${mid.r}, ${mid.changes} değişiklik`);
}

// ---------------------------------------------------------------- 5) kablolama
{
  const app = rd('../js/app.js'), sat = rd('../js/satlayer.js'), ast = rd('../js/asteroids.js'), sc = rd('../js/scene.js');
  check('app.js: denetleyici webdriver, ?adapt=0, sinematik kip, tasarım ve gizli sekmede çalışmaz', /const govOn = !navigator\.webdriver && new URLSearchParams\(location\.search\)\.get\('adapt'\) !== '0'/.test(app) && /if \(govOn && !cinema\.on && !designing && !document\.hidden\)/.test(app));
  check('app.js: oran değişince çizim tamponu ve nokta katmanları (uydu/asteroit) ölçeklenir; sonradan kurulan katman da', /world\.setPixelRatio\(r\)/.test(app) && /sats\.setPixelScale\(k\)/.test(app) && /asts\.setPixelScale\(k\)/.test(app) && /if \(gov\.r !== gov\.max\)/.test(app));
  check('katmanlar: setPixelScale px uniform\'unu devicePixelRatio × k yapar (k = 1 iken değişiklik yok)', /setPixelScale\(k\) \{ this\.mat\.uniforms\.px\.value = \(window\.devicePixelRatio \|\| 1\) \* k; \}/.test(sat) && /setPixelScale\(k\) \{ this\.mat\.uniforms\.px\.value = \(window\.devicePixelRatio \|\| 1\) \* k; \}/.test(ast));
  check('scene: setPixelRatio tamponu yeniden boyutlar; prMax en yüksek oran', /setPixelRatio\(r\) \{ this\.renderer\.setPixelRatio\(r\); this\.resize\(/.test(sc) && /this\.prMax = Math\.min\(window\.devicePixelRatio, 2\)/.test(sc));
  check('app.js: gizli sekmede oynayan görev duraklar, dönünce (kendisi duraklatmadıysa) sürer; ?bg=1 ile kapatılır', /document\.addEventListener\('visibilitychange'/.test(app) && /get\('bg'\) === '1'/.test(app) && /if \(running && !designing\) \{ bgPaused = true; setPlay\(false\); \}/.test(app) && /else if \(bgPaused\) \{ bgPaused = false; setPlay\(true\); \}/.test(app));
  check('app.js: durum iletisi işleyicisinde karedeki DOM sorgusu yok (chkNbody önbellekte)', !/\$\('#chkNbody'\)\.checked/.test(app) && /const canvas = \$\('#view'\), chkNbody = \$\('#chkNbody'\)/.test(app));
}

console.log(fail ? `\n${fail} HATA` : '\nTüm denetimler geçti');
process.exit(fail ? 1 : 0);
