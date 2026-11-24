// Uydu bozunma iş parçacığı sınaması (Node): cd web && node test/test_decaywork.js
//  1) decaywork.js sözleşmesi: iş parçacığı ortamı taklit edilir (postMessage, onmessage, dosyadan fetch); sonuç GP sırasıyla ve ana iş parçacığındaki
//     decayOf'la birebir aynı; ilerleme iletileri; yeni istek eskisini bırakır
//  2) impact.js hızlandırmaları sonucu değiştirmez: ay dizini (tablonun ilk ayı bir kez) eski ISO ayrıştırmasıyla aynı; yılın günü yıl sınırlarında doğru
//  2b) atmosfer sütunu: sonuç hesap sırasından bağımsız (önceden başka cisimler hesaplanmış olsa da bit bit aynı). Başvuru (fixtures/decay_ref400.json,
//      400 cisim, o günkü geçmiş satırlarıyla): durum, güven, yöntem aynı; ömür 10⁻¹² oranı içinde
//  3) sütunlu aktarım (gpdata.js packOmm/unpackOmm): değerler birebir (null, eksik alan, karışık sütun); SAT_FIELDS hesabın okuduğu her alanı kapsar
//  4) arayüz sözleşmesi: ImpactUI iş parçacığını deney açılınca kurar, hata verirse eski dilimli yola düşer; decayhist adresleri modüle göre; ön yükleme
import fs from 'fs';
import { execFileSync } from 'child_process';

let fail = 0;
const check = (name, ok) => { console.log(`${ok ? 'TAMAM' : 'HATA '} ${name}`); if (!ok) fail++; };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// ---------------------------------------------------------------- iş parçacığı ortamı
const posted = [];
globalThis.postMessage = (m) => posted.push(m);
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => {                                                       // file:// adresleri (decayhist modüle göre çözer) diskten
  const s = String(u); if (!s.startsWith('file:')) return realFetch(u);
  try { const b = fs.readFileSync(new URL(s)); return { ok: true, json: async () => JSON.parse(b) }; } catch (e) { return { ok: false, json: async () => null }; }
};
await import('../js/decaywork.js');
const { decayOf, loadHist, histData } = await import('../js/decayhist.js');
const { packOmm, unpackOmm } = await import('../js/gpdata.js');
const { SAT_FIELDS } = await import('../js/impact.js');
const job = (id, list) => { const p = packOmm(list, SAT_FIELDS); return { cmd: 'run', id, n: p.n, cols: p.cols, now: NOW }; };       // ImpactUI'nin gönderdiği biçim
const send = (d) => globalThis.onmessage({ data: d });
const waitDone = async (id) => { for (let k = 0; k < 2000; k++) { const m = posted.find((q) => q.type === 'done' && q.id === id); if (m) return m; await new Promise((r) => setTimeout(r, 5)); } return null; };

const gp = JSON.parse(read('test/fixtures/gp_active.json'));
const base = Array.isArray(gp) ? gp : gp.omm || gp.data || [], omm = [...base, ...base, ...base].slice(0, 1200);     // ilerleme 500 cisimde bir: üç kat
const NOW = Date.parse('2026-11-20T00:00:00Z');
{
  send({ cmd: 'warm' }); await loadHist();
  check(`geçmiş özeti iş parçacığında modüle göre adresle yüklenir (${histData() ? 'gecmis.json okundu' : 'yok'})`, !!histData());
  send(job(1, omm));
  const d = await waitDone(1), ref = omm.map((o) => decayOf(o, NOW, false));
  check(`sütunlu aktarımla sonuç GP sırasıyla, tam GP kaydıyla ana iş parçacığında hesaplanan decayOf'la birebir aynı (${omm.length} cisim, ${d ? d.ms.toFixed(0) : '?'} ms)`,
    !!d && d.out.length === omm.length && JSON.stringify(d.out) === JSON.stringify(ref.map(({ h, r }) => ({ h, r }))));
  const pr = posted.filter((q) => q.type === 'progress' && q.id === 1);
  check(`ilerleme iletileri (${pr.length}): artan, toplamla`, pr.length >= 2 && pr.every((q, k) => q.n === omm.length && (!k || q.i > pr[k - 1].i)));
}
{
  posted.length = 0;
  send(job(2, omm)); await new Promise((r) => setTimeout(r, 0));
  send(job(3, omm.slice(0, 50)));
  const d3 = await waitDone(3); await new Promise((r) => setTimeout(r, 50));
  check('yeni istek (yeni katalog) eskisini bırakır: yalnız son isteğin sonucu gelir', !!d3 && d3.out.length === 50 && !posted.some((q) => q.type === 'done' && q.id === 2));
}

// ---------------------------------------------------------------- impact.js: aynı sonuç
{
  const I = await import('../js/impact.js');
  const TAB = JSON.parse(read('test/fixtures/f107_2026-11-12.json')); I.setSolarTable(TAB);
  // eski yol: tablonun ilk ayı her çağrıda t0'ın ISO yazımından
  const [y0, m0] = TAB.ilkAy.split('-').map(Number), t0 = Date.UTC(y0, m0 - 1, 15, 12), mid = (k) => Date.UTC(y0, m0 - 1 + k, 15, 12), n = TAB.f.length;
  const oldF = (ms) => { const [y, m] = new Date(t0).toISOString().slice(0, 7).split('-').map(Number), d = new Date(ms);
    let k = (d.getUTCFullYear() - y) * 12 + d.getUTCMonth() - (m - 1); if (ms < mid(k)) k--; k = Math.max(0, Math.min(n - 2, k));
    const a = mid(k), b = mid(k + 1), u = (ms - a) / (b - a); return TAB.f[k] + (TAB.f[k + 1] - TAB.f[k]) * u; };
  const t1 = mid(n - 1), day = TAB.gunluk ? Date.parse(TAB.gunluk.ilkGun + 'T00:00:00Z') : Infinity;
  let bad = 0, cnt = 0;
  for (let ms = t0; ms <= t1 && ms < day; ms += 86400e3 * 3.7) { cnt++; if (I.solarF107(ms) !== oldF(ms)) bad++; }
  check(`F10.7 aylık aradeğerleme eski ISO ayrıştırmasıyla birebir (${cnt} tarih)`, cnt > 100 && bad === 0);
  // yılın günü önbelleği: yıl sınırının iki yanında ve geri giderken mevsim yoğunluğu doğrudan hesaplananla aynı
  const at = (iso) => Date.parse(iso), h = 450;
  const seq = ['2025-12-31T23:00:00Z', '2026-01-01T01:00:00Z', '2024-02-29T12:00:00Z', '2024-12-31T23:59:00Z', '2026-07-01T00:00:00Z', '2025-01-01T00:00:00Z'];
  const fwd = seq.map((s) => I.atmosphereDensity(h, 150, 15, at(s))), back = [...seq].reverse().map((s) => I.atmosphereDensity(h, 150, 15, at(s))).reverse();
  check('yılın günü (son yıl önbellekte): yıl sınırında, artık yılda ve geri sırayla aynı yoğunluk', fwd.every((v, k) => v === back[k] && v > 0));
}

// ---------------------------------------------------------------- atmosfer hızlandırmaları: eski kodla aynı sonuç
{
  const I = await import('../js/impact.js');
  const REF = JSON.parse(read('test/fixtures/decay_ref400.json')), byId = new Map(gp.map((o) => [+o.NORAD_CAT_ID, o]));
  I.setSolarTable(JSON.parse(read('test/fixtures/' + REF.f107)));
  const now = Date.parse(REF.now); let bad = 0, maxRel = 0, ecc = 0;
  for (const [id, durum, conf, method, life] of REF.rows) {
    const o = byId.get(id), r = REF.hist[id], h = r ? I.histRow(r) : null, a = I.assessSat(o, now, false, I.calibHist(h));
    if (a.ecc > 0.1) ecc++;
    if (a.durum !== durum || (a.conf ?? null) !== conf || (a.method ?? null) !== method) { bad++; continue; }
    const L = Number.isFinite(a.lifeDays) ? a.lifeDays : a.lifeDays == null ? null : 'inf';
    if (typeof life === 'number') maxRel = Math.max(maxRel, Math.abs(L - life) / life); else if (L !== life) bad++;
  }
  check(`başvuruyla 400 cisim (${ecc} eksantrik, ${REF.rows.filter((q) => q[5]).length} geçmişli): durum, güven, yöntem aynı; ömürde en büyük göreli fark ${maxRel.toExponential(1)}`, bad === 0 && maxRel < 1e-12);
  // sıra bağımsızlığı: önbellekler süreç boyunca kalır; bu yüzden iki ayrı süreçte: (a) yalnız bu 120 cisim, (b) önce başka Güneş tablosu ve başka cisimler,
  // sonra aynı 120 cisim. Çıktılar bit bit aynı olmalı (eski sürümde sütun kovaya ilk düşen değerden kurulduğu için ~10⁻³ ayrışıyordu)
  const child = (pollute) => execFileSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'fs'; const I = await import(${JSON.stringify(new URL('../js/impact.js', import.meta.url).href)});
    const rd = (f) => JSON.parse(fs.readFileSync(new URL(f, ${JSON.stringify(new URL('./fixtures/', import.meta.url).href)}), 'utf8'));
    const gp = rd('gp_active.json'), REF = rd('decay_ref400.json'), now = Date.parse(REF.now), by = new Map(gp.map((o) => [+o.NORAD_CAT_ID, o]));
    if (${pollute}) { I.setSolarTable(rd('f107_2025-07-20.json')); for (const o of gp) I.assessSat(o, now, false, null); }          // başka Güneş tablosu: aynı kovalara başka F10.7 değerleri düşer
    I.setSolarTable(rd(REF.f107));
    process.stdout.write(JSON.stringify(REF.rows.map(([id]) => I.assessSat(by.get(id), now, false, null))));`], { encoding: 'utf8', maxBuffer: 64e6 });
  const ca = child(false), cb = child(true);
  check(`sonuç hesap sırasından bağımsız: iki ayrı süreçte (yalnız / önbellekler önce başka tablo ve cisimlerle doldurulmuş) 400 cisim bit bit aynı — bilgi kartı ve liste ayrı iş parçacıklarında aynı tarihi verir`, ca.length > 1000 && ca === cb);
  // ay sırası (ay başları tablosundan): Ap aylık değeri eski yolla (yıl ve ay farkı) aynı
  const TAB = JSON.parse(read('test/fixtures/f107_2026-11-12.json')); I.setSolarTable(TAB);
  const [y0, m0] = TAB.ilkAy.split('-').map(Number), t0 = Date.UTC(y0, m0 - 1, 15, 12), t1 = Date.UTC(y0, m0 - 1 + TAB.f.length - 1, 15, 12), day = TAB.gunluk ? Date.parse(TAB.gunluk.ilkGun + 'T00:00:00Z') : Infinity;
  const apTail = I.solarAp(t1 + 400 * 864e5); let n = 0, apBad = 0;
  for (const ms of [...Array(3000)].map((_, k) => t0 + ((k * 7919) % 3000) / 3000 * (Math.min(t1, day - 1) - t0))) {         // sıra karışık: önbellekteki son ay da sınanır
    const d = new Date(ms), v = TAB.ap[(d.getUTCFullYear() - y0) * 12 + d.getUTCMonth() - (m0 - 1)], want = v != null && v >= 0 ? v : apTail; n++; if (I.solarAp(ms) !== want) apBad++;
  }
  check(`Ap aylık değeri eski yıl–ay hesabıyla aynı (${n} tarih, karışık sırayla)`, apBad === 0);
}

// ---------------------------------------------------------------- sütunlu aktarım
{
  const rows = [{ A: 1, B: 'x', C: null, D: 2 }, { A: 2.5, B: null, C: 3 }, { A: -0, B: 'y', C: 'z', D: NaN }];
  const p = packOmm(rows, ['A', 'B', 'C', 'D']), back = unpackOmm(structuredClone({ n: p.n, cols: p.cols }, { transfer: p.transfer }));
  const same = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => Object.is(a[k], b[k]));
  check('sayı sütunu Float64Array (aktarılır); karışık sütun düz dizi; null korunur, eksik alan eksik kalır; −0 ve NaN birebir',
    p.cols.A instanceof Float64Array && p.transfer.length === 1 && Array.isArray(p.cols.B) && Array.isArray(p.cols.D) && back.every((o, i) => same(o, rows[i])) && !('D' in back[1]));
  const full = gp.slice(0, 400), slim = unpackOmm(packOmm(full, SAT_FIELDS));
  check(`GP kaydında yalnız SAT_FIELDS (${SAT_FIELDS.length} alan) taşınır; değerleri aynı`, slim.every((o, i) => SAT_FIELDS.every((k) => Object.is(o[k], full[i][k]))) && Object.keys(slim[0]).length <= SAT_FIELDS.length && Object.keys(full[0]).length > SAT_FIELDS.length);
  // impact.js'te GP kaydından okunan her alan (o.ALAN) listede olmalı: yeni alan eklenip listeye yazılmazsa iş parçacığında sessizce undefined olurdu
  const used = new Set([...read('js/impact.js').matchAll(/\bo\.([A-Z][A-Z_]+)/g), ...read('js/decayhist.js').matchAll(/\bo\.([A-Z][A-Z_]+)/g)].map((m) => m[1]));
  check(`SAT_FIELDS impact.js ve decayhist.js'in okuduğu her GP alanını kapsar (${[...used].join(', ')})`, used.size >= 10 && [...used].every((k) => SAT_FIELDS.includes(k)));
}

// ---------------------------------------------------------------- arayüz sözleşmesi
{
  const iui = read('js/impactui.js'), hist = read('js/decayhist.js'), w = read('js/decaywork.js');
  check('ImpactUI: iş parçacığı deney açılınca kurulur ve ısıtılır (katalog gelmeden modüller ve geçmiş verisi hazır)', /const w = this\.decayWorker\(\); if \(w && !this\.warmed\)/.test(iui) && /postMessage\(\{ cmd: 'warm' \}\)/.test(iui));
  check('ImpactUI: hesap iş parçacığında; sonuç GP sırasıyla eşlenir; iş parçacığı yoksa ya da çökerse eski dilimli yol',
    /const p = packOmm\(omm, SAT_FIELDS\); w\.postMessage\(\{ cmd: 'run', id, n: p\.n, cols: p\.cols, now \}, p\.transfer\)/.test(iui) && /omm\.map\(\(o, k\) => \(\{ o, id: \+o\.NORAD_CAT_ID, \.\.\.d\.out\[k\] \}\)\)/.test(iui)
    && /this\.dw\.onerror = \(\) => \{ this\.dw\.terminate\(\); this\.dw = null;/.test(iui) && /performance\.now\(\) - t0 < 12/.test(iui));
  check('decayhist: veri adresleri modülün yerine göre (iş parçacığında da çözülür); iş parçacığı dilim arasında gerçekten bekler',
    /new URL\('\.\.\/' \+ u, import\.meta\.url\)/.test(hist) && /setTimeout\(r, 0\)/.test(w) && /workerOpts\(\)/.test(iui));
}

globalThis.fetch = realFetch;
console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
