// Uydu bozunma iş parçacığı sınaması (Node): cd web && node test/test_decaywork.js
//  1) decaywork.js sözleşmesi: iş parçacığı ortamı taklit edilir (postMessage, onmessage, dosyadan fetch); sonuç GP sırasıyla ve ana iş parçacığındaki
//     decayOf'la birebir aynı; ilerleme iletileri; yeni istek eskisini bırakır
//  2) impact.js hızlandırmaları sonucu değiştirmez: ay dizini (tablonun ilk ayı bir kez) eski ISO ayrıştırmasıyla aynı; yılın günü yıl sınırlarında doğru
//  3) arayüz sözleşmesi: ImpactUI iş parçacığını deney açılınca kurar, hata verirse eski dilimli yola düşer; decayhist adresleri modüle göre; ön yükleme
import fs from 'fs';

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
const send = (d) => globalThis.onmessage({ data: d });
const waitDone = async (id) => { for (let k = 0; k < 2000; k++) { const m = posted.find((q) => q.type === 'done' && q.id === id); if (m) return m; await new Promise((r) => setTimeout(r, 5)); } return null; };

const gp = JSON.parse(read('test/fixtures/gp_active.json'));
const base = Array.isArray(gp) ? gp : gp.omm || gp.data || [], omm = [...base, ...base, ...base].slice(0, 1200);     // ilerleme 500 cisimde bir: üç kat
const NOW = Date.parse('2026-11-20T00:00:00Z');
{
  send({ cmd: 'warm' }); await loadHist();
  check(`geçmiş özeti iş parçacığında modüle göre adresle yüklenir (${histData() ? 'gecmis.json okundu' : 'yok'})`, !!histData());
  send({ cmd: 'run', id: 1, omm, now: NOW });
  const d = await waitDone(1), ref = omm.map((o) => decayOf(o, NOW, false));
  check(`sonuç GP sırasıyla, ana iş parçacığındaki decayOf'la birebir aynı (${omm.length} cisim, ${d ? d.ms.toFixed(0) : '?'} ms)`,
    !!d && d.out.length === omm.length && JSON.stringify(d.out) === JSON.stringify(ref.map(({ h, r }) => ({ h, r }))));
  const pr = posted.filter((q) => q.type === 'progress' && q.id === 1);
  check(`ilerleme iletileri (${pr.length}): artan, toplamla`, pr.length >= 2 && pr.every((q, k) => q.n === omm.length && (!k || q.i > pr[k - 1].i)));
}
{
  posted.length = 0;
  send({ cmd: 'run', id: 2, omm, now: NOW }); await new Promise((r) => setTimeout(r, 0));
  send({ cmd: 'run', id: 3, omm: omm.slice(0, 50), now: NOW });
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

// ---------------------------------------------------------------- arayüz sözleşmesi
{
  const iui = read('js/impactui.js'), hist = read('js/decayhist.js'), w = read('js/decaywork.js');
  check('ImpactUI: iş parçacığı deney açılınca kurulur ve ısıtılır (katalog gelmeden modüller ve geçmiş verisi hazır)', /const w = this\.decayWorker\(\); if \(w && !this\.warmed\)/.test(iui) && /postMessage\(\{ cmd: 'warm' \}\)/.test(iui));
  check('ImpactUI: hesap iş parçacığında; sonuç GP sırasıyla eşlenir; iş parçacığı yoksa ya da çökerse eski dilimli yol',
    /w\.postMessage\(\{ cmd: 'run', id, omm, now \}\)/.test(iui) && /omm\.map\(\(o, k\) => \(\{ o, id: \+o\.NORAD_CAT_ID, \.\.\.d\.out\[k\] \}\)\)/.test(iui)
    && /this\.dw\.onerror = \(\) => \{ this\.dw\.terminate\(\); this\.dw = null;/.test(iui) && /performance\.now\(\) - t0 < 12/.test(iui));
  check('decayhist: veri adresleri modülün yerine göre (iş parçacığında da çözülür); iş parçacığı dilim arasında gerçekten bekler',
    /new URL\('\.\.\/' \+ u, import\.meta\.url\)/.test(hist) && /setTimeout\(r, 0\)/.test(w) && /workerOpts\(\)/.test(iui));
}

globalThis.fetch = realFetch;
console.log(fail ? `\n${fail} HATA` : '\nTAMAM');
process.exit(fail ? 1 : 0);
