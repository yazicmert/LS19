// Gerçek yeniden girişlerden sınama örneği üretir: web/test/fixtures/reentry_real.json (test/test_impact.js "gerçek yeniden girişler" bölümü kullanır).
// Girdi: halka açık CelesTrak etkin katalog TLE'lerinin anlık görüntüleri (github.com/jtmiclat/celestrak-historical, raw-data/tle-data.txt), bir klasörde
// <unix saniye>_<sha>.txt adlarıyla. Elde etmek için (≈ 4,5 günde bir görüntü, ~230 MB):
//   git clone --filter=blob:none --no-checkout https://github.com/jtmiclat/celestrak-historical repo
//   git -C repo log --format='%H %ct' -- raw-data/tle-data.txt | sort -k2 -n | awk '{ if ($2 >= n) { print; n = $2 + 4.5*86400 } }' > picks.txt
//   mkdir snap; xargs -P 6 -n 2 sh -c 'curl -sS -o snap/$1_$0.txt https://raw.githubusercontent.com/jtmiclat/celestrak-historical/$0/raw-data/tle-data.txt' < picks.txt
// Kullanım: node tools/yeniden_giris_ornegi.mjs --anlik snap [--cikti web/test/fixtures/reentry_real.json]
// Seçim: etkin katalogdan çıkmış (son görüntüden ≥ 20 gün önce kaybolmuş), son TLE perijesi 120–260 km ve modelin o TLE'den kalan süresi < 25 gün olan cisimler;
// kendi itkisiyle inen/iten büyük takımyıldızlar ve istasyon araçları hariç. "Gerçek" yeniden giriş anı = son TLE çağı + o TLE'den kalan süre (medyan ~2 gün).
// Cisim başına yeniden girişten ~45, ~150 ve ~330 gün önceki TLE alınır; o güne kadarki a(t) geçmişi tools/gecmis_derle.mjs satır biçiminde eklenir.
import fs from 'node:fs';
import path from 'node:path';
import * as M from '../web/js/impact.js';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SNAP = arg('anlik', ''), OUT = arg('cikti', 'web/test/fixtures/reentry_real.json'), MU = 398600.4418, RE = 6378.135, DAY = 864e5;
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
const dec = [];
for (const [id, s] of S) {
  const R = s.rec, l = R[R.length - 1];
  if (l.st > tEnd - 20 * DAY || hp(l) > 260 || hp(l) < 120 || BAD.test(s.name) || R.length < 6) continue;
  const rem = M.assessSat(omm(l), l.t, false); if (!(rem.lifeDays < 25)) continue;
  dec.push({ id: +id, name: s.name, R, tAct: l.t + rem.lifeDays * DAY });
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
  gercek: 'yeniden giriş anı = son TLE çağı + modelin o TLE\'den hesapladığı kalan süre (medyan ~2 gün); kalanGun = o an − çağ',
  alanlar: 'gecmis: tools/gecmis_derle.mjs satır biçimi (impact.histRow)', cisim: dec.length, satir: out.length }, satirlar: out }));
console.log(`yazıldı: ${OUT} · ${dec.length} cisim, ${out.length} satır, ${(fs.statSync(OUT).size / 1024).toFixed(0)} kB`);
