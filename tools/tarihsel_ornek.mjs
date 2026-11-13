// Çok yıllık yeniden giriş tahminlerini gerçek kayıtla sınamak için tarihsel örnek üretir: web/test/fixtures/reentry_hist.json
// (test/test_impact.js "tarihsel yeniden girişler" bölümü). Kaynaklar (ikisi de J. McDowell, planet4589.org):
//   • GCAT nesne kataloğu satcat.tsv (CC-BY): yeniden giriş tarihleri (DDate), durum, perije/apoje — https://planet4589.org/space/gcat/
//   • Tarihsel TLE arşivi (XTLE; nesne başına dosya, 100'lük dizinler) — https://planet4589.org/space/ele.html
//     Arşiv sitesine göre ABD hükümeti kaynaklı TLE'ler yeniden dağıtımı kısıtlamayan kaynaklardan alınmıştır; yeni dönem verisi içermez.
// Seçim: 1965–2016 arasında Dünya'ya yeniden girmiş (Status R, kesin tarihli), ömrü ≥ 1,5 yıl, perije 150–900 km, apoje ≤ 3000 km; her on yıldan
// tohumlu rastgele en çok 160 cisim. Her cisim için yeniden girişten ~1 ay, 3 ay, 6 ay, 1, 2, 4 ve 8 yıl önceki (±%20) TLE; "est/guess" etiketli
// (uydurulmuş) elemanlar atılır.
// --sansur dosya: olası aralığın (Kaplan–Meier) sınaması için sonuçtan bağımsız, sağdan sansürlü örnek: pasif LEO cisimleri (roket gövdesi, enkaz, parça;
//   fırlatma 1965–2010; GCAT'te bugünkü perije ≤ 900 km ve apoje ≤ 3.000 km — pasif cisimde ikisi de yalnız azaldığından bu süzgeç çağdaki koşulu yanlılıksız
//   kapsar); cisim başına tohumlu rastgele iki TLE çağı (1965–2015, perije 150–900 km). Sonuç: yeniden giriş (GCAT DDate) ya da GCAT güncelleme tarihinde
//   hâlâ yörüngede (sansürlü).
// --heo dosya: ayrıca yeniden girmiş GTO/HEO cisimleri (roket gövdesi ve yük; apoje ≥ 15.000 km, perije < 1.500 km, 1975–2016; hepsi) — Ay–Güneş sınaması
// Kullanım: node tools/tarihsel_ornek.mjs --gcat satcat.tsv [--onbellek /tmp/ls19-ele] [--cikti web/test/fixtures/reentry_hist.json] [--heo web/test/fixtures/reentry_heo.json]
//           [--sansur web/test/fixtures/reentry_km.json]
// (HTTPS vekili arkasında: NODE_USE_ENV_PROXY=1 ile çalıştırın)
import fs from 'node:fs';
import path from 'node:path';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT_KM = arg('sansur', ''), OUT_HEO = arg('heo', ''), GCAT = arg('gcat', ''), CACHE = arg('onbellek', path.join(process.env.TMPDIR || '/tmp', 'ls19-ele')), OUT = arg('cikti', 'web/test/fixtures/reentry_hist.json');
if (!GCAT || !fs.existsSync(GCAT)) { console.error('Kullanım: node tools/tarihsel_ornek.mjs --gcat satcat.tsv  (https://planet4589.org/space/gcat/tsv/cat/satcat.tsv)'); process.exit(2); }
fs.mkdirSync(CACHE, { recursive: true });
const MU = 398600.4418, RE = 6378.135, DAY = 864e5, YR = 365.25, MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const vd = (s) => { const m = /^\s*(\d{4})\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{2})(\d{2}))?/.exec(s || ''); return m ? { t: Date.UTC(+m[1], MON[m[2]], +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0), y: +m[1], unc: /\?/.test(s) } : null; };
// ---- GCAT seçimi
let hdr = null, gcatUpd = null; const cand = [], heo = [], kmc = [];
for (const line of fs.readFileSync(GCAT, 'utf8').split(/\r?\n/)) {
  if (line.startsWith('#JCAT')) { hdr = line.slice(1).split('\t'); continue; }
  if (line.startsWith('# Updated')) { gcatUpd = vd(line.replace('# Updated', '')); continue; }
  if (!hdr || line.startsWith('#') || !line) continue;
  const p = line.split('\t').map((x) => x.trim()), r = Object.fromEntries(hdr.map((h, i) => [h, p[i]]));
  if (OUT_KM && r.Primary === 'Earth' && /^\d+$/.test(r.Satcat || '') && 'RDC'.includes((r.Type || ' ')[0]) && (r.Status === 'O' || r.Status === 'R')) {
    const l0 = vd(r.LDate), d0 = vd(r.DDate), pe0 = parseFloat(r.Perigee), ap0 = parseFloat(r.Apogee);
    if (l0 && l0.y >= 1965 && l0.y <= 2010 && pe0 <= 900 && ap0 <= 3000 && (r.Status === 'O' || (d0 && !d0.unc))) kmc.push({ id: +r.Satcat, type: r.Type[0], tD: r.Status === 'R' ? d0.t : null });
  }
  if (r.Status !== 'R' || r.Primary !== 'Earth' || !/^\d+$/.test(r.Satcat || '')) continue;
  const d = vd(r.DDate), l = vd(r.LDate); if (!d || !l || d.unc) continue;
  const pe = parseFloat(r.Perigee), ap = parseFloat(r.Apogee);
  if (OUT_HEO && ap >= 15000 && pe < 1500 && 'RP'.includes((r.Type || '')[0]) && d.y >= 1975 && d.y <= 2016) heo.push({ id: +r.Satcat, type: r.Type[0], tD: d.t });
  if (!(pe >= 150 && pe <= 900 && ap <= 3000)) continue;
  if (!(d.y >= 1965 && d.y <= 2016 && (d.t - l.t) / DAY / YR >= 1.5)) continue;
  cand.push({ id: +r.Satcat, type: (r.Type || '').slice(0, 1), tD: d.t, dec: Math.floor(d.y / 10) });
}
let seed = 19; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const byDec = new Map(); for (const c of cand) { if (!byDec.has(c.dec)) byDec.set(c.dec, []); byDec.get(c.dec).push(c); }
const picks = [];
for (const [, a] of [...byDec].sort((x, y) => x[0] - y[0])) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } picks.push(...a.slice(0, 160)); }
console.log(`GCAT adayı ${cand.length}, seçilen ${picks.length}`);
// ---- arşivden indir (önbellekli; siteye yük bindirmemek için en çok 4 eşzamanlı istek)
const file = (id) => path.join(CACHE, `S${String(id).padStart(5, '0')}`);
let seedK = 23; const rndK = () => ((seedK = (seedK * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let i = kmc.length - 1; i > 0; i--) { const j = Math.floor(rndK() * (i + 1)); [kmc[i], kmc[j]] = [kmc[j], kmc[i]]; }
const kmPick = OUT_KM ? kmc.slice(0, 2200) : [];
const q = [...picks, ...heo, ...kmPick].filter((p) => !fs.existsSync(file(p.id)));
await Promise.all(Array.from({ length: 4 }, async () => {
  while (q.length) { const p = q.shift(), dir = String(Math.floor(p.id / 100) * 100).padStart(5, '0');
    try { const r = await fetch(`https://planet4589.org/space/elements/${dir}/S${String(p.id).padStart(5, '0')}`, { headers: { 'User-Agent': 'LS19 (+https://github.com/yazicmert/LS19)' } }); fs.writeFileSync(file(p.id), r.ok ? Buffer.from(await r.arrayBuffer()) : ''); } catch (e) { console.log('indirilemedi', p.id, e.message); }
    await new Promise((z) => setTimeout(z, 200)); }
}));
// ---- XTLE ayrıştır, hedef sürelere en yakın TLE'leri seç
const expo = (s) => { const m = /^\s*([+-]?)(\d+)([+-]\d)\s*$/.exec(s); return m ? +(m[1] + '0.' + m[2]) * 10 ** +m[3] : 0; };
function parse(txt, deep = false) {
  const L = txt.split(/\r?\n/), out = [];
  for (let i = 0; i + 1 < L.length; i++) {
    const l1 = L[i], l2 = L[i + 1]; if (l1[0] !== '1' || l2[0] !== '2' || l1.length < 63 || l2.length < 63) continue;
    const l3 = L[i + 2] && L[i + 2][0] === '3' ? L[i + 2] : '';
    if (/est|guess/i.test(l3)) { i++; continue; }
    const yy = +l1.slice(18, 20), doy = +l1.slice(20, 32), t = Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (doy - 1) * DAY;
    const n = +l2.slice(52, 63), e = +('0.' + l2.slice(26, 33).trim());
    if (!(deep ? n > 0.8 && n < 17 : n > 10 && n < 17.5) || !(e >= 0 && e < (deep ? 0.99 : 0.3)) || !Number.isFinite(t)) { i++; continue; }
    out.push({ t, n, e, b: expo(l1.slice(53, 61)), nd: +l1.slice(33, 43) || 0, i: +l2.slice(8, 16), O: +l2.slice(17, 25), w: +l2.slice(34, 42) }); i++;
  }
  return out.sort((a, b) => a.t - b.t);
}
const r6 = (x, n = 6) => +x.toPrecision(n), rows = []; let nObj = 0;
for (const p of picks) {
  const f = file(p.id); if (!fs.existsSync(f) || !fs.statSync(f).size) continue;
  const R = parse(fs.readFileSync(f, 'utf8')); if (R.length < 3) continue; let used = false;
  for (const ly of [0.08, 0.25, 0.5, 1, 2, 4, 8]) {
    const want = p.tD - ly * YR * DAY; let best = null;
    for (const r of R) { const lead = (p.tD - r.t) / DAY / YR; if (lead > 0.02 && Math.abs(lead - ly) < ly * 0.2 && (!best || Math.abs(r.t - want) < Math.abs(best.t - want))) best = r; }
    if (!best) continue;
    const a = Math.cbrt(MU / (best.n * 2 * Math.PI / 86400) ** 2), hp = a * (1 - best.e) - RE; if (hp < 125 || hp > 1200) continue;
    rows.push({ id: p.id, tur: p.type, epoch: new Date(best.t).toISOString().slice(0, 19), n: best.n, e: best.e, bstar: best.b, ndot: best.nd, kalanGun: r6((p.tD - best.t) / DAY), hedefYil: ly }); used = true;
  }
  if (used) nObj++;
}
fs.writeFileSync(OUT, JSON.stringify({ meta: { kaynak: 'GCAT (J. McDowell, planet4589.org/space/gcat, CC-BY) yeniden giriş tarihleri; TLE: J. McDowell tarihsel TLE arşivi (planet4589.org/space/ele.html)',
  secim: '1965–2016 yeniden girişler, ömür ≥ 1,5 yıl, perije 150–900 km, apoje ≤ 3000 km, on yıl başına en çok 160 cisim (tohum 19); hedef süreler 0,08–8 yıl (±%20)', cisim: nObj, satir: rows.length }, satirlar: rows }));
console.log(`yazıldı: ${OUT} · ${nObj} cisim, ${rows.length} satır, ${(fs.statSync(OUT).size / 1024).toFixed(0)} kB`);

// ---- GTO/HEO
if (OUT_HEO) {
  const rows = []; let nH = 0;
  for (const p of heo) {
    const f = file(p.id); if (!fs.existsSync(f) || !fs.statSync(f).size) continue;
    const R = parse(fs.readFileSync(f, 'utf8'), true); if (R.length < 3) continue; let used = false;
    for (const ly of [0.08, 0.25, 0.5, 1, 2, 4, 8]) {
      const want = p.tD - ly * YR * DAY; let best = null;
      for (const r of R) { const lead = (p.tD - r.t) / DAY / YR; if (lead > 0.02 && Math.abs(lead - ly) < ly * 0.2 && (!best || Math.abs(r.t - want) < Math.abs(best.t - want))) best = r; }
      if (!best) continue;
      const a = Math.cbrt(MU / (best.n * 2 * Math.PI / 86400) ** 2); if (a * (1 + best.e) - RE < 15000 || 1440 / best.n < 225) continue;
      rows.push({ id: p.id, tur: p.type, epoch: new Date(best.t).toISOString().slice(0, 19), n: best.n, e: best.e, bstar: best.b, ndot: best.nd, i: best.i, raan: best.O, argp: best.w, kalanGun: r6((p.tD - best.t) / DAY), hedefYil: ly }); used = true;
    }
    if (used) nH++;
  }
  fs.writeFileSync(OUT_HEO, JSON.stringify({ meta: { kaynak: 'GCAT (J. McDowell, CC-BY) yeniden giriş tarihleri; TLE: J. McDowell tarihsel TLE arşivi', secim: 'yeniden girmiş roket gövdesi ve yükler, apoje ≥ 15.000 km, perije < 1.500 km, 1975–2016; hedef süreler 0,08–8 yıl (±%20)', cisim: nH, satir: rows.length }, satirlar: rows }));
  console.log(`yazıldı: ${OUT_HEO} · ${nH} cisim, ${rows.length} satır, ${(fs.statSync(OUT_HEO).size / 1024).toFixed(0)} kB`);
}

// ---- sağdan sansürlü örnek (Kaplan–Meier)
if (OUT_KM) {
  const CENS = gcatUpd ? gcatUpd.t : Date.now(), rows = []; let nK = 0;
  for (const p of kmPick) {
    const f = file(p.id); if (!fs.existsSync(f) || !fs.statSync(f).size) continue;
    const R = parse(fs.readFileSync(f, 'utf8')).filter((r) => { const a = Math.cbrt(MU / (r.n * 2 * Math.PI / 86400) ** 2), hp = a * (1 - r.e) - RE;
      return r.t >= Date.UTC(1965, 0) && r.t <= Date.UTC(2015, 11, 31) && hp >= 150 && hp <= 900 && a * (1 + r.e) - RE <= 3000 && (!p.tD || r.t < p.tD - DAY); });
    if (!R.length) continue; nK++;
    for (let k = 0; k < 2; k++) { const r = R[Math.floor(rndK() * R.length)];
      rows.push({ id: p.id, tur: p.type, epoch: new Date(r.t).toISOString().slice(0, 19), n: r.n, e: r.e, bstar: r.b, ndot: r.nd, i: r.i, olay: !!p.tD, gun: r6(((p.tD || CENS) - r.t) / DAY) }); }
  }
  fs.writeFileSync(OUT_KM, JSON.stringify({ meta: { kaynak: 'GCAT (J. McDowell, CC-BY); TLE: J. McDowell tarihsel TLE arşivi', secim: 'pasif LEO (R/D/C), fırlatma 1965–2010, sonuçtan bağımsız; cisim başına 2 rastgele çağ (1965–2015); olay=false: sansürlü (GCAT güncellemesinde yörüngede)', sansurTarihi: new Date(CENS).toISOString().slice(0, 10), cisim: nK, satir: rows.length }, satirlar: rows }));
  console.log(`yazıldı: ${OUT_KM} · ${nK} cisim, ${rows.length} satır (sansürlü ${rows.filter((r) => !r.olay).length}), ${(fs.statSync(OUT_KM).size / 1024).toFixed(0)} kB`);
}
