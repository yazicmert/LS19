// LS19 DAMIT asteroit şekilleri (DAMIT, CC BY 4.0) — tools/damit_paketle.py'nin Blender gerektirmeyen karşılığı, aynı çıktı biçimi:
// web/models/ast/damit/damit_NNN.bin.gz + damit.json (js/asteroids.js okur, test/test_damit.js doğrular).
// LS19'un asteroit kümesindeki (SBDB: Dünya'ya yakınlar, ana kuşak H<13,5, Truvalılar H<13) her asteroit için DAMIT'teki en iyi model seçilir
// (dışbükey olmayan > kalite > ölçeklenmiş boyut > yeni), ≤ 800 üçgene sadeleştirilir (meshoptimizer), hacim eşdeğeri yarıçap 1'e ölçeklenir,
// int16/uint16 nicemlenip 60'lık parçalara bölünür. NASA PDS / Eyes modeli olan asteroitler (models/ast/katalog.json) atlanır.
//
//   node tools/model/damit.mjs --indir            DAMIT'in tam dökümünü (~4 GB) diske indirir (kesilirse kaldığı yerden), yalnız gereken tablo ve
//                                                şekil dosyalarını çıkarır, dökümü siler (--dokumu-tut: silme)
//   node tools/model/damit.mjs --dokum <klasör>    önceden açılmış döküm (damit-*/ : tables/*.csv, files/asteroid_*/model_*/shape.txt)
//   ek: --liste <dosya> (satır başına SBDB adı; yoksa SBDB'den alınır)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { execSync } from 'child_process';
import { MeshoptSimplifier } from 'meshoptimizer';
import { ROOT, ARA, UA, arg, getText, sbdbListesi, csv, rapor } from './ortak.mjs';

await MeshoptSimplifier.ready;
const OUT = path.join(ROOT, 'web/models/ast'), MAXF = 800, SHARD = 60, Q = 8000;
const REF = 'DAMIT (Ďurech, Sidorin & Kaasalainen 2010, A&A 513, A46), CC BY 4.0';

const liste = arg('--liste') ? new Set(fs.readFileSync(arg('--liste'), 'utf8').split('\n').map((s) => s.trim()).filter(Boolean)) : await sbdbListesi();
const nasa = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(OUT, 'katalog.json'), 'utf8'))));

let dokum = arg('--dokum');
if (process.argv.includes('--indir')) {
  // 1) asteroit tablosu (küçük): LS19 kümesindeki DAMIT asteroitlerinin kimlikleri → döküm içinden yalnız onların şekilleri çıkarılır
  // DAMIT'in yeni dökümlerinde tablo yok: asteroit tablosu ayrı dışa aktarımdan; model tablosu da oradan (sunucu hata verirse tablosuz kip)
  const astCsv = await getText('https://damit.cuni.cz/projects/damit/exports/table/asteroids', { timeoutMs: 300000 });
  let modelCsv = null;
  try { modelCsv = await getText('https://damit.cuni.cz/projects/damit/exports/table/asteroid_models', { timeoutMs: 600000 }); } catch (e) { console.log(`DAMIT model tablosu alınamadı (${e.message}): tablosuz kip`); }
  const asts = csv(astCsv);
  const ids = asts.filter((a) => liste.has(a.number || a.designation)).map((a) => a.id);
  if (ids.length < 1000) throw new Error(`DAMIT asteroit tablosu beklenenden az eşleşti (${ids.length})`);
  dokum = path.join(ARA, 'damit'); fs.rmSync(dokum, { recursive: true, force: true }); fs.mkdirSync(dokum, { recursive: true });
  const desen = path.join(ARA, 'damit-desen.txt');
  fs.writeFileSync(desen, ids.flatMap((i) => [`*/files/asteroid_${i}/model_*/shape.txt`, `*/files/asteroid_${i}/model_*/spin.txt`]).join('\n') + '\n');
  // 2) tam döküm (~4 GB) diske, kesilirse kaldığı yerden (HTTP Range); 'latest' yönlendirmeden akıttığı için somut dosya adı dışa aktarım sayfasından
  const ad = (await getText('https://damit.cuni.cz/projects/damit/exports')).match(/exports\/complete\/(damit-\d{8}T\d{6}Z\.tar\.gz)/)?.[1];
  if (!ad) throw new Error('DAMIT dışa aktarım sayfasında döküm adı bulunamadı');
  const dosya = path.join(ARA, ad), url = `https://damit.cuni.cz/projects/damit/exports/complete/${ad}`;
  for (const f of fs.readdirSync(ARA)) if (/^damit-.*\.tar\.gz$/.test(f) && f !== ad) fs.rmSync(path.join(ARA, f));   // eski dökümler
  console.log(`DAMIT: ${ids.length} asteroit; döküm ${ad} indiriliyor…`);
  const t0 = Date.now();
  for (let i = 1; ; i++) {
    try { execSync(`curl -sSfL -C - -A "${UA['User-Agent']}" -o "${dosya}" "${url}"`, { stdio: 'inherit' }); break; } catch (e) {
      if (e.status === 22 && fs.existsSync(dosya) && fs.statSync(dosya).size > 1e9) break;     // 416: zaten tamam
      if (i >= 8) throw new Error(`döküm indirilemedi (curl ${e.status})`);
      console.log(`DAMIT: kesildi (curl ${e.status}), ${(fs.existsSync(dosya) ? fs.statSync(dosya).size : 0) / 1e9 | 0} GB'tan sürdürülüyor (${i}/7)`);
    }
  }
  console.log(`DAMIT: ${(fs.statSync(dosya).size / 1e9).toFixed(2)} GB, ${(Date.now() - t0) / 1000 | 0} sn; gereken dosyalar çıkarılıyor…`);
  // 3) yalnız LS19 asteroitlerinin şekil ve dönme dosyaları; modeli olmayan asteroit desenleri "bulunamadı" der (tar çıkış 2): sorun değil
  try { execSync(`tar -xzf "${dosya}" -C "${dokum}" --wildcards -T "${desen}"`, { stdio: ['ignore', 'inherit', 'pipe'] }); } catch (e) {
    const hata = String(e.stderr || '').split('\n').filter((l) => l && !/Not found in archive|Exiting with failure status/.test(l));
    if (e.status !== 2 || hata.length) throw new Error(`tar: ${hata.slice(0, 3).join(' | ') || e.status}`);
  }
  if (!process.argv.includes('--dokumu-tut')) fs.rmSync(dosya);
  const kok = fs.readdirSync(dokum).find((d) => d.startsWith('damit-')); if (!kok) throw new Error('döküm açılamadı');
  dokum = path.join(dokum, kok);
  fs.mkdirSync(path.join(dokum, 'tables'), { recursive: true });
  fs.writeFileSync(path.join(dokum, 'tables/asteroids.csv'), astCsv);
  if (modelCsv) fs.writeFileSync(path.join(dokum, 'tables/asteroid_models.csv'), modelCsv);
  console.log(`DAMIT: döküm ${(Date.now() - t0) / 1000 | 0} sn'de alındı (${kok})`);
}
if (!dokum) { console.log('kullanım: node tools/model/damit.mjs --indir | --dokum <klasör> [--liste <dosya>]'); process.exit(2); }

const ast = Object.fromEntries(csv(fs.readFileSync(path.join(dokum, 'tables/asteroids.csv'), 'utf8')).map((r) => [r.id, r]));
const tabloYolu = path.join(dokum, 'tables/asteroid_models.csv'), TABLOSUZ = !fs.existsSync(tabloYolu);
const fl = (s, d = null) => (s === '' || s == null ? d : +s);
// Tablosuz kip: model listesi klasörlerden, dönme durumu spin.txt'den (λ β P / JD0 φ0), dışbükeylik geometriden; seçim: en yeni model
// (en büyük model kimliği). Kalite bayrağı ve ölçeklenmiş boyut bilinmez: mevcut modeller (tabloyla seçilmiş) olduğu gibi korunur, yalnız yeni asteroit eklenir.
function dosyadanModeller() {
  const out = [], fd = path.join(dokum, 'files');
  for (const a of fs.readdirSync(fd)) {
    const aid = a.replace('asteroid_', '');
    for (const m of fs.readdirSync(path.join(fd, a))) {
      const sp = path.join(fd, a, m, 'spin.txt'); if (!m.startsWith('model_') || !fs.existsSync(sp)) continue;
      const L = fs.readFileSync(sp, 'utf8').trim().split(/\s+/);
      out.push({ id: m.replace('model_', ''), asteroid_id: aid, lambda: L[0], beta: L[1], period: L[2], jd0: L[3], phi0: L[4], quality_flag: '', calibrated_size: '0', equiv_diameter: '', nonconvex: null, created: '' });
    }
  }
  return out;
}
function disbukeyDegil(v, f) {                                        // bir köşe herhangi bir yüz düzleminin dışında kalıyorsa dışbükey değil
  let R = 0; for (let i = 0; i < v.length; i++) R = Math.max(R, Math.abs(v[i]));
  const nv = v.length / 3, adim = Math.max(1, Math.floor(nv / 300));
  for (let k = 0; k < f.length; k += 3) {
    const a = 3 * f[k], b = 3 * f[k + 1], c = 3 * f[k + 2];
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2], wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, nn = Math.hypot(nx, ny, nz); if (!nn) continue;
    for (let i = 0; i < nv; i += adim) if (((v[3 * i] - v[a]) * nx + (v[3 * i + 1] - v[a + 1]) * ny + (v[3 * i + 2] - v[a + 2]) * nz) / nn > 0.1 * R) return true;     // üçgenleme gürültüsü ≤ ~%1,5 R; gerçek oyuklar ≳ %30 R
  }
  return false;
}
const models = TABLOSUZ ? dosyadanModeller() : csv(fs.readFileSync(tabloYolu, 'utf8'));
const daha = (a, b) => { for (let i = 0; i < a.length; i++) { if (a[i] > b[i]) return true; if (a[i] < b[i]) return false; } return false; };   // Python demet karşılaştırması

const best = new Map();
for (const m of models) {
  const a = ast[m.asteroid_id]; if (!a) continue;
  const des = a.number || a.designation;
  if (!liste.has(des) || nasa.has(des)) continue;
  const p = path.join(dokum, `files/asteroid_${m.asteroid_id}/model_${m.id}/shape.txt`);
  if (!fs.existsSync(p) || fl(m.lambda) == null || fl(m.period) == null) continue;
  const score = TABLOSUZ ? [0, +m.id] : [+(m.nonconvex || 0), fl(m.quality_flag, 0), +(m.calibrated_size || 0), m.created || ''];
  if (!best.has(des) || daha(score, best.get(des)[0])) best.set(des, [score, m, p]);
}

function oku(p) {
  const L = fs.readFileSync(p, 'utf8').trim().split(/\s+/), nv = +L[0], nf = +L[1];
  const v = new Float64Array(nv * 3), f = new Uint32Array(nf * 3);
  for (let i = 0; i < nv * 3; i++) v[i] = +L[2 + i];
  for (let i = 0; i < nf * 3; i++) f[i] = +L[2 + nv * 3 + i] - 1;
  return { v, f };
}
function hacim(v, f) {
  let s = 0;
  for (let k = 0; k < f.length; k += 3) {
    const a = 3 * f[k], b = 3 * f[k + 1], c = 3 * f[k + 2];
    s += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
  }
  return s / 6;
}
const ters = (f) => { for (let k = 0; k < f.length; k += 3) { const t = f[k + 1]; f[k + 1] = f[k + 2]; f[k + 2] = t; } };
function sadelestir(v, f) {                                           // ≤ MAXF üçgen; hata sınırı gevşek: hedef sayıya mutlaka insin
  const [idx] = MeshoptSimplifier.simplify(f, new Float32Array(v), 3, MAXF * 3, 1.0);
  return idx;
}

const DIR = path.join(OUT, 'damit'), eskiIdx = fs.existsSync(path.join(DIR, 'damit.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'damit.json'), 'utf8')) : { m: {} };
const eski = eskiIdx.m, eskiParca = new Map();
function eskiKayit(des) {                                             // mevcut kaydın baytları ve meta verisi (parça kimliği ve ofset hariç)
  const m = eski[des]; if (!eskiParca.has(m[0])) eskiParca.set(m[0], zlib.gunzipSync(fs.readFileSync(path.join(DIR, `damit_${String(m[0]).padStart(3, '0')}.bin.gz`))));
  return [des, Buffer.from(eskiParca.get(m[0]).subarray(m[1], m[1] + m[2] * 6 + m[3] * 6)), m.slice(2)];
}
const kayitlar = [], korunan = []; let atlanan = 0;
if (TABLOSUZ) for (const des of Object.keys(eski)) if (liste.has(des) && !nasa.has(des)) { kayitlar.push(eskiKayit(des)); korunan.push(des); }
for (const des of [...best.keys()].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))) {
  if (TABLOSUZ && eski[des]) continue;
  const [, m, p] = best.get(des);
  try {
    const s = oku(p); let { v, f } = s;
    if (m.nonconvex === null) m.nonconvex = disbukeyDegil(v, f) ? 1 : 0;
    let vol = hacim(v, f);
    if (vol < 0) { ters(f); vol = -vol; }                              // yüzleri dışa baktır
    if (!(vol > 0) || f.length / 3 < 20) { atlanan++; continue; }
    if (f.length / 3 > MAXF) { f = sadelestir(v, f); if (hacim(v, f) < 0) ters(f); }
    if (f.length / 3 > MAXF || f.length / 3 < 20) { atlanan++; console.log('ATLANDI (sadeleştirme)', des); continue; }
    const req = Math.cbrt(3 * Math.abs(hacim(v, f)) / (4 * Math.PI));
    // kullanılan köşeler, yeniden numaralandırma, nicemleme
    const remap = new Int32Array(v.length / 3).fill(-1); let n = 0;
    for (const i of f) if (remap[i] < 0) remap[i] = n++;
    const rec = Buffer.alloc(n * 6 + f.length * 2);
    for (let i = 0; i < remap.length; i++) {
      if (remap[i] < 0) continue;
      for (let k = 0; k < 3; k++) rec.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v[3 * i + k] / req * Q))), (remap[i] * 3 + k) * 2);
    }
    for (let k = 0; k < f.length; k++) rec.writeUInt16LE(remap[f[k]], n * 6 + k * 2);
    kayitlar.push([des, rec, [n, f.length / 3, fl(m.lambda), fl(m.beta), fl(m.period), fl(m.jd0, 2451545.0), fl(m.phi0, 0.0), fl(m.equiv_diameter), +(m.calibrated_size || 0), +(m.nonconvex || 0)]]);
  } catch (e) { atlanan++; console.log('ATLANDI', des, e.message); }
}
const EN_AZ = +(process.env.LS19_DAMIT_EN_AZ || 4000);                // eksik döküm mevcut veriyi küçültmesin
if (kayitlar.length < EN_AZ) throw new Error(`yalnız ${kayitlar.length} model üretildi (beklenen ≥ ${EN_AZ}): yazılmadı`);

kayitlar.sort((a, b) => a[0].length - b[0].length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
for (const f of fs.readdirSync(path.join(OUT, 'damit'))) if (/^damit_\d+\.bin\.gz$/.test(f)) fs.rmSync(path.join(OUT, 'damit', f));
const index = {}; let toplam = 0;
for (let si = 0; si < kayitlar.length; si += SHARD) {
  const parca = kayitlar.slice(si, si + SHARD), bloklar = []; let off = 0;
  for (const [des, rec, meta] of parca) { index[des] = [si / SHARD, off, ...meta]; bloklar.push(rec); off += rec.length; }
  const data = zlib.gzipSync(Buffer.concat(bloklar), { level: 9 }); toplam += data.length;
  fs.writeFileSync(path.join(OUT, 'damit', `damit_${String(si / SHARD).padStart(3, '0')}.bin.gz`), data);
}
fs.writeFileSync(path.join(OUT, 'damit/damit.json'), JSON.stringify({ q: Q, shard: SHARD, ref: REF, m: index }));

const yeni = Object.keys(index).filter((d) => !eski[d]), giden = Object.keys(eski).filter((d) => !index[d]);
rapor('DAMIT asteroit şekilleri (CC BY 4.0)', `${TABLOSUZ ? `- **Tablosuz kip:** DAMIT'in model tablosu dışa aktarımı alınamadı; mevcut ${korunan.length} model olduğu gibi korundu, yeni asteroitlerde en yeni model seçildi, dönme durumu spin.txt'den, dışbükeylik geometriden.\n` : ''}- Model: **${kayitlar.length}** (önce ${Object.keys(eski).length}); yeni **${yeni.length}**, çıkan ${giden.length}, atlanan ${atlanan}
- Parça: ${Math.ceil(kayitlar.length / SHARD)} dosya, ${(toplam / 1048576).toFixed(1)} MB (gzip); ortalama ${Math.round(kayitlar.reduce((a, r) => a + r[2][1], 0) / kayitlar.length)} üçgen
${yeni.length ? `- Yeni örnekler: ${yeni.slice(0, 12).join(', ')}${yeni.length > 12 ? ' …' : ''}` : ''}${giden.length ? `\n- Çıkanlar: ${giden.slice(0, 12).join(', ')}${giden.length > 12 ? ' …' : ''}` : ''}`);
