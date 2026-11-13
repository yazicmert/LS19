// Gerçek yeniden girişlerden sınama örneği üretir: web/test/fixtures/reentry_real.json (test/test_impact.js "gerçek yeniden girişler" bölümü kullanır).
// Girdi: halka açık CelesTrak etkin katalog TLE'lerinin anlık görüntüleri (github.com/jtmiclat/celestrak-historical, raw-data/tle-data.txt), bir klasörde
// <unix saniye>_<sha>.txt adlarıyla. Elde etmek için (≈ 4,5 günde bir görüntü, ~230 MB):
//   git clone --filter=blob:none --no-checkout https://github.com/jtmiclat/celestrak-historical repo
//   git -C repo log --format='%H %ct' -- raw-data/tle-data.txt | sort -k2 -n | awk '{ if ($2 >= n) { print; n = $2 + 4.5*86400 } }' > picks.txt
//   mkdir snap; xargs -P 6 -n 2 sh -c 'curl -sS -o snap/$1_$0.txt https://raw.githubusercontent.com/jtmiclat/celestrak-historical/$0/raw-data/tle-data.txt' < picks.txt
// Kullanım: node tools/yeniden_giris_ornegi.mjs --anlik snap [--cikti web/test/fixtures/reentry_real.json] [--uzun web/test/fixtures/decay_1yil.json]
//                                              [--derin web/test/fixtures/reentry_deep.json]
// --uzun: uzun ömürlü (350–700 km, dairesel, manevrasız) edilgen cisimlerin ilk TLE'si ve ~1 yıl sonra gözlenen yarı büyük eksen düşüşü (bozunma hızının 1 yıllık sınaması)
// --derin: ESA'nın açıkladığı Cluster II yeniden giriş anlarıyla (aşağıda, kaynaklı) derin uzay (Ay–Güneş) sınaması
// --gcat satcat.tsv: J. McDowell'in GCAT kataloğu (https://planet4589.org/space/gcat/tsv/cat/satcat.tsv, CC-BY). Verilirse "gerçek" yeniden giriş anı
//   GCAT'teki DDate'tir ve yalnız GCAT'in yeniden girdi (Status R) dediği cisimler alınır; verilmezse son TLE + modelin kalan süresi.
// Seçim: etkin katalogdan çıkmış (son görüntüden ≥ 20 gün önce kaybolmuş), son TLE perijesi 120–260 km ve modelin o TLE'den kalan süresi < 25 gün olan cisimler;
// kendi itkisiyle inen/iten büyük takımyıldızlar ve istasyon araçları hariç. "Gerçek" yeniden giriş anı = son TLE çağı + o TLE'den kalan süre (medyan ~2 gün).
// Cisim başına yeniden girişten ~45, ~150 ve ~330 gün önceki TLE alınır; o güne kadarki a(t) geçmişi tools/gecmis_derle.mjs satır biçiminde eklenir.
import fs from 'node:fs';
import path from 'node:path';
import * as M from '../web/js/impact.js';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const GCAT = arg('gcat', ''), SNAP = arg('anlik', ''), OUT = arg('cikti', 'web/test/fixtures/reentry_real.json'), OUT_LONG = arg('uzun', ''), OUT_DEEP = arg('derin', ''), MU = 398600.4418, RE = 6378.135, DAY = 864e5;
// son TLE'den kalan süre de uygulamanın kullandığı Güneş aktivitesi tablosuyla hesaplanır
if (fs.existsSync(arg('f107', 'web/data/f107.json'))) M.setSolarTable(JSON.parse(fs.readFileSync(arg('f107', 'web/data/f107.json'), 'utf8')));
if (!SNAP || !fs.existsSync(SNAP)) { console.error('Kullanım: node tools/yeniden_giris_ornegi.mjs --anlik <anlık görüntü klasörü>'); process.exit(2); }
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const catNo = (s) => { s = s.trim(); return /^[A-Z]/.test(s) ? (10 + ALPHA.indexOf(s[0])) * 10000 + +s.slice(1) : +s; };
const expo = (s) => { const m = /^\s*([+-]?)(\d+)([+-]\d)\s*$/.exec(s); return m ? +(m[1] + '0.' + m[2]) * 10 ** +m[3] : 0; };
const files = fs.readdirSync(SNAP).filter((f) => /^\d+_.*\.txt$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)), S = new Map(), snapT = [];
for (const f of files) {
  const st = +f.split('_')[0] * 1000; snapT.push(st);
  const L = fs.readFileSync(path.join(SNAP, f), 'utf8').split(/\r?\n/);
  for (let i = 0; i + 2 < L.length; i++) {
    const l1 = L[i + 1], l2 = L[i + 2]; if (!l1 || !l2 || l1[0] !== '1' || l2[0] !== '2') continue;
    const id = catNo(l1.slice(2, 7)), yy = +l1.slice(18, 20), doy = +l1.slice(20, 32), year = yy < 57 ? 2000 + yy : 1900 + yy, t = Date.UTC(year, 0, 1) + (doy - 1) * 864e5;
    const n = +l2.slice(52, 63); if (!(n > 0)) { i += 2; continue; }
    const r = { t, st, n, e: +('0.' + l2.slice(26, 33).trim()), b: expo(l1.slice(53, 61)), nd: +l1.slice(33, 43), i: +l2.slice(8, 16), O: +l2.slice(17, 25), w: +l2.slice(34, 42), cos: l1.slice(9, 17).trim() };
    let a = S.get(id); if (!a) S.set(id, (a = { name: L[i].trim(), rec: [] }));
    const last = a.rec[a.rec.length - 1]; if (!last || r.t > last.t) a.rec.push(r); else last.st = st;      // aynı TLE sonraki görüntüde de var
    i += 2;
  }
}
const tEnd = snapT[snapT.length - 1], aOf = (r) => Math.cbrt(MU / (r.n * 2 * Math.PI / 86400) ** 2), hp = (r) => aOf(r) * (1 - r.e) - RE;
const omm = (r) => ({ EPOCH: new Date(r.t).toISOString().slice(0, 23), MEAN_MOTION: r.n, ECCENTRICITY: r.e, BSTAR: r.b, MEAN_MOTION_DOT: r.nd, INCLINATION: r.i, RA_OF_ASC_NODE: r.O, ARG_OF_PERICENTER: r.w });
const BAD = /STARLINK|ONEWEB|KUIPER|ISS|TIANGONG|CSS|PROGRESS|SOYUZ|DRAGON|CYGNUS|SHENZHOU|TIANZHOU|HTV|QIANFAN|GUOWANG|HULIANWANG/;
// GCAT: Satcat no -> { t: yeniden giriş anı (ms), kesin: saat belirtilmiş ve ? yok }
const gcat = new Map();
if (GCAT) {
  const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }; let hdr = null;
  for (const line of fs.readFileSync(GCAT, 'utf8').split(/\r?\n/)) {
    if (line.startsWith('#JCAT')) { hdr = line.slice(1).split('\t'); continue; }
    if (!hdr || line.startsWith('#') || !line) continue;
    const p = line.split('\t').map((x) => x.trim()), r = Object.fromEntries(hdr.map((h, i) => [h, p[i]]));
    if (!/^\d+$/.test(r.Satcat || '')) continue;
    const m = /^(\d{4})\s+([A-Z][a-z]{2})\s+(\d{1,2})(?:\s+(\d{2})(\d{2}))?/.exec(r.DDate || '');
    gcat.set(+r.Satcat, { status: r.Status, t: m ? Date.UTC(+m[1], MON[m[2]], +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0) : null, kesin: !!(m && m[4]) && !/\?/.test(r.DDate) });
  }
  console.log(`GCAT: ${gcat.size} kayıt`);
}
const dec = []; let gcatYok = 0, gcatYorungede = 0;
for (const [id, s] of S) {
  const R = s.rec, l = R[R.length - 1];
  if (l.st > tEnd - 20 * DAY || hp(l) > 260 || hp(l) < 120 || BAD.test(s.name) || R.length < 6) continue;
  const rem = M.assessSat(omm(l), l.t, false); if (!(rem.lifeDays < 25)) continue;
  let tAct = l.t + rem.lifeDays * DAY;
  if (GCAT) { const g = gcat.get(+id); if (!g || !g.t) { gcatYok++; continue; } if (g.status !== 'R') { gcatYorungede++; continue; } tAct = g.t; }
  dec.push({ id: +id, name: s.name, R, tAct });
}
const out = [], r4 = (x, n = 6) => +x.toPrecision(n);
for (const d of dec) for (const want of [45, 150, 330]) {
  let best = null; for (let k = 0; k < d.R.length - 1; k++) { const lead = (d.tAct - d.R[k].t) / DAY; if (lead >= 20 && Math.abs(lead - want) < want * 0.25 && (!best || Math.abs(lead - want) < Math.abs(best.lead - want))) best = { k, lead }; }
  if (!best) continue;
  const r = d.R[best.k], h0 = M.analyzeHistory(d.R.slice(0, best.k + 1).map((x) => ({ t: x.t, a: aOf(x) }))); let h = null;
  if (h0.durum === 'ok') h = [h0.n, r4(h0.spanDays, 5), h0.boostCount, h0.lastBoostMs ? Math.round(h0.lastBoostMs / DAY) : 0, r4(h0.slopeKmDay, 5), r4(h0.slopeRms, 4), r4(aOf(r), 8), Math.round(r.t / DAY), r4(M.expectedDecayKmDay(aOf(r), r.e, r.b), 5), r4(h0.segDays, 5)];
  out.push({ id: d.id, ad: d.name, epoch: new Date(r.t).toISOString().slice(0, 19), n: r.n, e: r.e, bstar: r.b, ndot: r.nd, i: r.i, raan: r.O, argp: r.w, kalanGun: r4(best.lead, 5), gecmis: h });
}
const iso = (t) => new Date(t).toISOString().slice(0, 10);
fs.writeFileSync(OUT, JSON.stringify({ meta: { kaynak: `CelesTrak (halka açık) · github.com/jtmiclat/celestrak-historical git geçmişi, ${iso(snapT[0])} – ${iso(tEnd)}, ${files.length} anlık görüntü`,
  secim: 'etkin katalogdan çıkmış, son TLE perijesi 120–260 km, modelin son TLE\'den kalan süresi < 25 gün; Starlink/OneWeb/Kuiper/istasyon araçları hariç',
  gercek: GCAT ? 'yeniden giriş anı = GCAT DDate (J. McDowell, planet4589.org/space/gcat, CC-BY); yalnız GCAT\'in yeniden girdi dediği cisimler; kalanGun = o an − çağ' : 'yeniden giriş anı = son TLE çağı + modelin o TLE\'den hesapladığı kalan süre (medyan ~2 gün); kalanGun = o an − çağ',
  alanlar: 'gecmis: tools/gecmis_derle.mjs satır biçimi (impact.histRow)', cisim: dec.length, satir: out.length }, satirlar: out }));
console.log(`yazıldı: ${OUT} · ${dec.length} cisim, ${out.length} satır, ${(fs.statSync(OUT).size / 1024).toFixed(0)} kB${GCAT ? ` (GCAT'te tarihi olmayan ${gcatYok}, GCAT'e göre yeniden girmemiş ${gcatYorungede} cisim atıldı)` : ''}`);

// ---- uzun ömürlü cisimler: ilk TLE ve ~1 yıl sonraki gözlenen a düşüşü
if (OUT_LONG) {
  const rows = []; let k = 0;
  for (const [id, s] of S) {
    const R = s.rec; if (R.length < 40 || BAD.test(s.name) || R[0].e > 0.01) continue;
    const h0 = aOf(R[0]) - RE; if (h0 < 350 || h0 > 700) continue;
    const end = R.filter((r) => (r.t - R[0].t) / DAY > 330).pop(); if (!end) continue;
    const an = M.analyzeHistory(R.map((r) => ({ t: r.t, a: aOf(r) }))); if (an.boostCount || an.slopeRms > 1.5) continue;
    const drop = aOf(R[0]) - aOf(end); if (!(drop > 1)) continue;
    if (k++ % 3) continue;                                                                                  // her üç cisimden biri (dosya küçük kalsın)
    const r = R[0]; rows.push({ id: +id, epoch: new Date(r.t).toISOString().slice(0, 19), n: r.n, e: r.e, bstar: r.b, ndot: r.nd, gun: r4((end.t - r.t) / DAY, 5), dususKm: r4(drop, 5) });
  }
  fs.writeFileSync(OUT_LONG, JSON.stringify({ meta: { kaynak: 'CelesTrak (halka açık) · github.com/jtmiclat/celestrak-historical', secim: '350–700 km, e < 0,01, ≥ 40 TLE, manevrasız (analyzeHistory), son TLE ilkinden > 330 gün sonra; her üç cisimden biri',
    alanlar: 'gun: ilk ve son TLE arası gün; dususKm: o sürede gözlenen yarı büyük eksen düşüşü', satir: rows.length }, satirlar: rows }));
  console.log(`yazıldı: ${OUT_LONG} · ${rows.length} cisim, ${(fs.statSync(OUT_LONG).size / 1024).toFixed(0)} kB`);
}

// ---- derin uzay: Cluster II (ESA'nın hedefli doğal bozunmayla indirdiği, çok eksantrik yörüngeli 4 uydu; perijeyi Ay–Güneş çekimi indirdi)
// Kaynaklar: Rumba 22 Eki 2025 (pencere 16:20–19:45 UTC) https://blogs.esa.int/rocketscience/2025/10/10/rumba-expected-to-reenter-on-22-october
//            Samba 31 Ağu 2026 21:39:38 UTC https://www.esa.int/articles/samba-s-fiery-farewell-recorded
//            Tango 1 Eyl 2026 21:30:31 UTC https://www.esa.int/articles/observing-samba-and-tango-s-reentries
if (OUT_DEEP) {
  const ESA = { 26463: ['CLUSTER II-FM5 (RUMBA)', Date.UTC(2025, 9, 22, 18, 0)], 26410: ['CLUSTER II-FM7 (SAMBA)', Date.UTC(2026, 7, 31, 21, 39, 38)], 26464: ['CLUSTER II-FM8 (TANGO)', Date.UTC(2026, 8, 1, 21, 30, 31)] };
  const rows = [];
  for (const [id, [ad, tAct]] of Object.entries(ESA)) {
    const s = S.get(+id); if (!s) { console.log('yok:', ad); continue; }
    s.rec.forEach((r, j) => { const lead = (tAct - r.t) / DAY; if (lead >= 5 && (j % 4 === 0 || j === s.rec.length - 1)) rows.push({ id: +id, ad, epoch: new Date(r.t).toISOString().slice(0, 19), n: r.n, e: r.e, bstar: r.b, ndot: r.nd, i: r.i, raan: r.O, argp: r.w, kalanGun: r4(lead, 5) }); });
  }
  fs.writeFileSync(OUT_DEEP, JSON.stringify({ meta: { kaynak: 'TLE: CelesTrak (github.com/jtmiclat/celestrak-historical); yeniden giriş anları: ESA (araçtaki kaynaklar)', satir: rows.length }, satirlar: rows }));
  console.log(`yazıldı: ${OUT_DEEP} · ${rows.length} satır`);
}
