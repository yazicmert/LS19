// Uyarlanır çizim çözünürlüğü (perfgov.js) ve arka plan duraklatma doğrulaması (Node 20+): cd web && node test/test_perfgov.js
//  1) oran 1 ise (ya da min = max) denetleyici etkin değil; geçersiz kare süreleri yok sayılır
//  2) doldurma oranına bağlı sahne (süre ∝ oran²): yavaşsa oran kademe kademe düşer, min'de durur, ağır/orta/hızlı makinede salınmaz
//  3) darboğaz piksel DEĞİLSE (CPU/köşe işi, iOS Düşük Güç Modu'nun 30 Hz sınırı): düşüş fayda getirmez → eski oran geri verilir, bir süre düşürülmez (yalnız bulanıklık eklenmesin)
//  4) geri çıkış: hafif sahneye geçince ya da sınır kalkınca oran kendiliğinden geri döner (tabanda takılı kalmaz); deneme yavaşlarsa tavan hatırlanır
//  5) ölçüm sağlamlığı: kare sıçramaları pencereyi bozmaz, çok yavaş cihaz (> 250 ms kare) yine ölçülür, > 1,5 sn duraklamalar ölçümü sıfırlar
//  6) app.js bağlantıları: webdriver/?adapt=0/sinematik/tasarım/gizli sekmede kapalı; noktalar ekranda aynı boyda kalır (setPixelScale); gizli sekmede duraklat/sürdür
import fs from 'fs';
import { PixelGovernor } from '../js/perfgov.js';

let fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fail++; };
const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');

// sentetik çizim döngüsü: frame(saniye, oran) → kare süresi (ms); governor'a beslenir, oran değişince maliyet hemen etkilenir
// fill(c, ekran): GPU'ya (doldurma oranına) bağlı: max(ekran aralığı, c·oran²); sabit(ms): oranla değişmeyen (CPU/köşe işi)
const fill = (c, refresh = 1000 / 60) => (t, r) => Math.max(refresh, c * r * r), sabit = (ms) => () => ms;
function simulate({ frame, max = 2, seconds = 300, spike = null, jitter = 0.4 }) {
  const g = new PixelGovernor({ max, min: 1 }); let now = 0, changes = 0, seed = 7, n = 0; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2; const hist = [];
  while (now < seconds * 1000) {
    let f = frame(now / 1000, g.r) + jitter * rnd(); if (spike && ++n % spike.every === 0) f = spike.ms;
    now += f; const r = g.tick(f, now); if (r) { changes++; hist.push([Math.round(now / 1000), r]); }
  }
  return { r: g.r, changes, hist };
}
const h = (x) => JSON.stringify(x.hist.slice(0, 10));

// ---------------------------------------------------------------- 1) etkinlik
check('oran 1 ya da min = max ise denetleyici etkin değil (hiç değişiklik önermez)', !new PixelGovernor({ max: 1, min: 1 }).active && Array.from({ length: 200 }, (_, i) => new PixelGovernor({ max: 1 }).tick(60, i * 60)).every((x) => x === null));
check('oran 2 ise etkin, başlangıç oranı = max', new PixelGovernor({ max: 2 }).active && new PixelGovernor({ max: 2 }).r === 2);
{ const g3 = new PixelGovernor({ max: 2 }); let n3 = 0; for (let i = 0; i < 500; i++) if (g3.tick(NaN, i) || g3.tick(0, i) || g3.tick(-5, i)) n3++;
  check('geçersiz kare süreleri (NaN, 0, negatif) yok sayılır', n3 === 0); }

// ---------------------------------------------------------------- 2) doldurma oranına bağlı sahne
{
  const heavy = simulate({ frame: fill(10) }), light = simulate({ frame: fill(3) }), mid = simulate({ frame: fill(6), seconds: 600 });
  check('ağır sahne (40 ms @2×): oran düşer, ≥ 40 kare/sn veren orada kalır; 5 dk\'da değişiklik sayısı sınırlı', heavy.r <= 1.5 && heavy.r >= 1 && 10 * heavy.r * heavy.r <= 24 + 0.01 && heavy.changes <= 8, `oran ${heavy.r}, ${heavy.changes} değişiklik: ${h(heavy)}`);
  check('hızlı makine (12 ms @2×): oran hiç düşmez', light.r === 2 && light.changes === 0);
  check('orta sahne (24 ms @2×): salınmaz (10 dk\'da ≤ 10 değişiklik)', mid.changes <= 10, `oran ${mid.r}, ${mid.changes} değişiklik`);
  const floor = new PixelGovernor({ max: 2, min: 1 }); let now = 0; const out = [];
  for (let i = 0; i < 40 * 8; i++) { const f = Math.max(16.7, 40 * floor.r * floor.r / 4); now += f; const r = floor.tick(f, now); if (r) out.push(r); }
  check('doldurma oranına bağlı yavaş kareler: oran 0,25 kademelerle 2 → min düşer ve min\'de durur', out[0] === 1.75 && floor.r >= 1 && out.every((x, i) => i === 0 || x < out[i - 1] || x === 1.75) && Math.min(...out) >= 1, out.join(' → '));
  const slow = simulate({ frame: fill(150), seconds: 400 });
  check('çok yavaş cihaz (600 ms @2×, > 250 ms kareler) yine ölçülür ve oran tabana iner', slow.r === 1, `oran ${slow.r}: ${h(slow)}`);
}

// ---------------------------------------------------------------- 3) darboğaz piksel değil → fayda yok, geri ver
{
  const cpu = simulate({ frame: sabit(40), seconds: 300 });
  check('CPU/köşe işine bağlı yavaşlık (40 ms, orandan bağımsız): bir kademe denenir, fayda yoksa eski oran geri gelir ve 5 dk düşürülmez', cpu.r === 2 && cpu.changes <= 3 && cpu.hist[0][1] === 1.75 && cpu.hist[1] && cpu.hist[1][1] === 2, `oran ${cpu.r}: ${h(cpu)}`);
  const cpuLong = simulate({ frame: sabit(40), seconds: 1200 });
  check('aynı durumda 20 dk boyunca değişiklik sayısı sınırlı (5 dk\'da bir deneme + geri)', cpuLong.r === 2 && cpuLong.changes <= 10, `${cpuLong.changes} değişiklik`);
  // iOS Düşük Güç Modu benzeri: ekran 30 Hz'e sınırlı, GPU boş → oran düşmesi hiçbir şeyi hızlandırmaz
  const lpm = simulate({ frame: fill(2, 33.3), seconds: 600 });
  check('30 Hz ekran sınırı (Düşük Güç Modu benzeri, GPU boş): oran kalıcı düşmez (fayda yok → geri), 10 dk\'da ≤ 6 değişiklik', lpm.r === 2 && lpm.changes <= 6, `oran ${lpm.r}, ${lpm.changes} değişiklik: ${h(lpm)}`);
}

// ---------------------------------------------------------------- 4) geri çıkış
{
  const change = simulate({ frame: (t, r) => (t < 120 ? fill(10) : fill(2))(t, r), seconds: 900 });
  const down = change.hist.filter((x) => x[0] < 120).map((x) => x[1]), end = change.hist.filter((x) => x[0] >= 120);
  check('ağır sahneden hafif sahneye geçince oran kendiliğinden max\'a döner (tabanda takılmaz)', down.length >= 2 && change.r === 2 && end.length >= 1, `önce ${down.join(',')}; sonra ${JSON.stringify(end)}; oran ${change.r}`);
  const g = new PixelGovernor({ max: 2, min: 1 }); let now = 0;
  const feed = (ms, n) => { const o = []; for (let i = 0; i < n; i++) { now += ms; const r = g.tick(ms, now); if (r) o.push([Math.round(now / 1000), r]); } return o; };
  feed(16.7, 40);
  const dn = feed(30, 40), early = feed(16.7, 40 * 3);
  check('düşüşten hemen sonra toparlansa bile bekleme süresi dolmadan çıkmaz', dn.length === 1 && dn[0][1] === 1.75 && early.length === 0, JSON.stringify([dn, early]));
  now += 16000; const up = feed(16.7, 40 * 2);
  check('bekleme dolunca ve kare süresi ekran ritminde ise bir kademe yükselir', up.length >= 1 && up[0][1] === 2, JSON.stringify(up));
  const mid = new PixelGovernor({ max: 2 }); let t = 0; for (let i = 0; i < 40; i++) { t += 16.7; mid.tick(16.7, t); } mid.r = 1.5; mid.cool = 0;
  let u = null; for (let i = 0; i < 40; i++) { t += 21; u = mid.tick(21, t) || u; }
  check('kare süresi ekran ritmine yakın değilse (21 ms; taban 16,7) yükselmez', u === null);
  // deneme yükseltme yavaşlatırsa tavan hatırlanır: 2 → 1,75 sabit; 1,75'te 18,4 ms (ekran ritmine yakın) ama 2×'te 24,5 ms (yavaş): bir deneme, sonra 30 dk deneme yok
  const trial = simulate({ frame: fill(6.2), seconds: 1500 });
  check('yükseltme denemesi yavaşlatıyorsa tavan 30 dk hatırlanır: salınım yok (25 dk\'da ≤ 4 değişiklik)', trial.changes <= 4, `oran ${trial.r}, ${trial.changes} değişiklik: ${h(trial)}`);
}

// ---------------------------------------------------------------- 5) ölçüm sağlamlığı
{
  const sp = simulate({ frame: fill(10), seconds: 120, spike: { every: 25, ms: 400 } });
  check('kare sıçramaları (her 25 karede 400 ms) ölçüm penceresini bozmaz: 60 sn içinde oran düşer', sp.hist.length >= 1 && sp.hist[0][0] <= 30 && sp.r <= 1.75, `ilk değişiklik ${sp.hist[0] ? sp.hist[0][0] : '-'} sn: ${h(sp)}`);
  const g2 = new PixelGovernor({ max: 2 }); let n = 0;
  for (let i = 0; i < 300; i++) if (g2.tick(i % 7 === 0 ? 2000 : 60, i * 60)) n++;
  check('> 1,5 sn duraklamalar (sekme/yükleme) ölçüm penceresini sıfırlar: sürekli kesilen ölçüm değişiklik üretmez', n === 0);
}

// ---------------------------------------------------------------- 6) kablolama
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
