// Ay görevi Monte Carlo özetleri (saf; DOM yok, Node'da sınanır: test/test_aymc.js). runs: nominalrun.js › flyDispersed sonuçları.
import { fmt } from './format.js';

// p-yüzdelik (doğrusal ara değer); boş dizi → null
export function quantile(xs, p) {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return null;
  const k = (a.length - 1) * p, i = Math.floor(k), f = k - i; return i + 1 < a.length ? a[i] + f * (a[i + 1] - a[i]) : a[i];
}
// başarı oranının %95 güven aralığı (Wilson): küçük örneklemde "20/20" %100 değil, ≥ %84 demektir
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
export function summarize(runs) {
  const n = runs.length, ok = runs.filter((r) => r.ok).length, col = (k) => runs.map((r) => r[k]).filter(Number.isFinite);
  const q3 = (k) => { const xs = col(k); return xs.length ? [quantile(xs, 0.05), quantile(xs, 0.5), quantile(xs, 0.95)] : null; };
  const grades = {}; for (const r of runs) grades[r.grade] = (grades[r.grade] || 0) + 1;
  return { n, ok, rate: n ? ok / n : 0, ci: wilson(ok, n), grades, prop: q3('prop'), propMin: col('prop').length ? Math.min(...col('prop')) : null,
    mcc: q3('mcc'), miss: q3('miss'), vz: q3('vz'), vh: q3('vh'), dv: q3('dvTotal'), fails: runs.filter((r) => !r.ok).map((r) => ({ seed: r.seed, why: r.reentry ? ['atmosfere girdi'] : r.why.length ? r.why : ['inemedi'] })) };
}
const pc = (x) => fmt(100 * x, 0);
// özet → düz dil: { kind, title, rows: [[etiket, değer]…] }
export function mcText(s, o = {}) {
  const title = `${s.ok}/${s.n} iniş başarılı (%${pc(s.rate)}; %95 güven aralığı %${pc(s.ci[0])}–${pc(s.ci[1])})`;
  const kind = s.ci[0] >= 0.9 ? 'good' : s.rate < 0.8 ? 'bad' : 'warn';
  const r3 = (q, d, u) => (q ? `${fmt(q[1], d)} ${u} (%90 aralığı: ${fmt(q[0], d)} – ${fmt(q[2], d)})` : '—');
  const rows = [
    ['Kalan yakıt', s.prop ? [r3(s.prop, 0, 'kg'), `en az ${fmt(s.propMin, 0)} kg`] : '—'],
    ['Rota düzeltmeleri (MCC toplamı)', r3(s.mcc, 1, 'm/s')],
    ['İniş yerine uzaklık', r3(s.miss, 1, 'm')],
    ['Temas: dikey hız', s.vz ? r3(s.vz.map((x) => -x).reverse(), 2, 'm/s') : '—'],
    ['Temas: yatay hız', r3(s.vh, 2, 'm/s')],
    ['Toplam Δv', r3(s.dv, 0, 'm/s')],
  ];
  // değer bir dizi olabilir: arayüz parçaları " · " ile ayrı metin düğümleri olarak yazar (çeviri her parçayı ayrı eşler)
  if (o.tliSigma != null) rows.push(['Hata modeli', [`TLI kesme 1σ ${fmt(o.tliSigma, 1)} m/s`, o.nav ? 'seyrüsefer hatası (IMU, radar, TRN)' : 'seyrüsefer kusursuz', ...(o.faultLabel ? [o.faultLabel] : [])]]);
  return { kind, title, rows };
}
