// CelesTrak uzay havası dosyasından (SW-All.txt, CSSI biçimi) aylık F10.7 tablosu üretir: web/data/f107.json.
// Kaynak: https://celestrak.org/SpaceData/SW-All.txt (biçim: https://celestrak.org/SpaceData/SpaceWx-format.php). CelesTrak'ın koşulu: lisans yok,
// yalnız kaynak adresi belirtilsin; dosya en sık 3 saatte bir indirilsin (haftalık iş akışı bunun çok altında kalır).
// Tablo: gözlenen aylar (günlük gözlenen F10.7'nin ay ortalaması) + CelesTrak'ın aylık tahmini (gözlenen son günden sonraki aylar).
// impact.js setSolarTable bu tabloyu kullanır; tablo yoksa ya da tarih tablonun dışındaysa ortalama çevrim biçimine düşer.
// Kullanım: node tools/uzay_havasi.mjs --girdi SW-All.txt [--cikti web/data/f107.json] [--kesim 2025-07-20]
//   --kesim: bu tarihten sonraki gözlemleri atar (geçmişe dönük sınama: o gün elde olacak tablo)
import fs from 'node:fs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const IN = arg('girdi', ''), OUT = arg('cikti', 'web/data/f107.json'), CUT = arg('kesim', '');
if (!IN || !fs.existsSync(IN)) { console.error('Kullanım: node tools/uzay_havasi.mjs --girdi SW-All.txt [--cikti web/data/f107.json]'); process.exit(2); }
const L = fs.readFileSync(IN, 'utf8').split(/\r?\n/), sec = (n) => { const a = L.indexOf('BEGIN ' + n), b = L.indexOf('END ' + n); return a >= 0 && b > a ? L.slice(a + 1, b) : []; };
const upd = (L.find((l) => l.startsWith('UPDATED')) || '').replace('UPDATED', '').trim();
// gözlenen F10.7 sondan 3. alan (Obs F10.7, Ctr81, Lst81); eksik değerler 0 ya da boş yazılır
const obs = new Map(), apM = new Map(), daily = []; let lastDay = '';
for (const l of sec('OBSERVED')) {
  const p = l.trim().split(/\s+/); if (p.length < 6) continue;
  const day = `${p[0]}-${p[1]}-${p[2]}`; if (CUT && day > CUT) continue;
  const f = +p[p.length - 3]; if (!(f > 30 && f < 500)) continue;
  const k = `${p[0]}-${p[1]}`; if (!obs.has(k)) obs.set(k, []); obs.get(k).push(f); lastDay = day;
  const ap = +p[22]; if (ap >= 0 && ap < 400) { if (!apM.has(k)) apM.set(k, []); apM.get(k).push(ap); }       // günlük ortalama Ap (Avg)
  const c81 = +p[p.length - 2]; daily.push({ day, ap: ap >= 0 && ap < 400 ? ap : null, f81: c81 > 30 && c81 < 500 ? c81 : f });  // gözlenen F10.7'nin 81 günlük merkezli ortalaması
}
// son ay eksikse (ayın ortası geçmemişse) gözlem yerine tahmin kullanılır
const months = [...obs.keys()].sort(), lastObs = months[months.length - 1];
if (obs.get(lastObs).length < 15) months.pop();
const pred = new Map();
for (const l of sec('MONTHLY_PREDICTED')) { const p = l.trim().split(/\s+/), f = +p[p.length - 3]; if (f > 30) pred.set(`${p[0]}-${p[1]}`, f); }
const first = months[0], ym = (s) => { const [y, m] = s.split('-').map(Number); return y * 12 + m - 1; }, name = (k) => `${Math.floor(k / 12)}-${String(k % 12 + 1).padStart(2, '0')}`;
const f = [], n0 = ym(first); let nObs = 0;
for (let k = n0; ; k++) {
  const key = name(k);
  if (k <= ym(months[months.length - 1])) { const v = obs.get(key); f.push(v ? Math.round(v.reduce((s, x) => s + x, 0) / v.length * 10) / 10 : null); nObs++; continue; }
  if (!pred.has(key)) { if (k > ym(months[months.length - 1]) + 2) break; f.push(null); continue; }        // gözlem ile tahmin arasındaki en çok iki boş ay aradeğerlenir
  f.push(pred.get(key));
}
while (f.length && f[f.length - 1] == null) f.pop();
for (let k = 1; k < f.length - 1; k++) if (f[k] == null) { let j = k + 1; while (j < f.length && f[j] == null) j++; f[k] = Math.round((f[k - 1] + (f[j] - f[k - 1]) / (j - k + 1)) * 10) / 10; }
// aylık ortalama Ap: yalnız gözlenen aylar (CelesTrak aylık tahmini Ap vermez; sonrası için impact.js son 12 ayın ortalamasını kullanır)
const ap = months.map((k) => { const v = apM.get(k); return v && v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length * 10) / 10 : null; });
// son ~3 yılın günlük değerleri: MSIS'in iki girdisi ayrı ayrı — 81 günlük ortalama F10.7 (taban termosfer sıcaklığı) ve günlük Ap (fırtına ısınması). Yoğunluk Ap'ye
// doğrusal olmayan biçimde bağlı olduğundan aylık ortalama, fırtınalı aylarda ortalama yoğunluğu düşük verir (docs/fizik_denetimi.md §4.2e). impact.js bu aralıkta günlük
// değeri kullanır; gelecekteki fırtınalar öngörülemez, bu yüzden yalnız gözlenen dönem içindir.
const GUN = 1100, dTail = daily.slice(-GUN);
const gunluk = dTail.length ? { ilkGun: dTail[0].day, f81: dTail.map((d) => Math.round(d.f81 * 10) / 10), ap: dTail.map((d) => d.ap) } : null;
const out = { kaynak: 'CelesTrak SW-All.txt (https://celestrak.org/SpaceData/SW-All.txt)', guncelleme: upd, sonGozlem: lastDay, ilkAy: first, gozlenenAy: nObs,
  aciklama: 'f: aylık ortalama F10.7 (sfu, gözlenen 10,7 cm akısı); ilk gozlenenAy değer gözlem, sonrası CelesTrak aylık tahmini. ap: gözlenen ayların ortalama günlük Ap değeri. gunluk: son ~3 yılın günlük 81 günlük ortalama F10.7 ve günlük Ap değeri', f, ap, gunluk };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`yazıldı: ${OUT} · ${first} → ${name(n0 + f.length - 1)} (${nObs} ay gözlem, ${f.length - nObs} ay tahmin; son gözlem ${lastDay}) · ${(fs.statSync(OUT).size / 1024).toFixed(1)} kB`);
