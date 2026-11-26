// lookstar19 asteroit verisi: LS19'un gerçek şekil modeli olan 33 asteroit (web/models/ast/katalog.json) için üç JPL SSD API'si:
//   SBDB  — yörünge elementleri ve 1σ belirsizlikleri, yörünge çözümünün künyesi (gözlem sayısı, aralık, RMS), fiziksel parametreler
//   CAD   — Dünya'ya 0,2 au'dan yakın geçişler, 1900–2200 (nominal uzaklık ve 3σ aralığı, göreli hız)
//   Sentry— çarpma riski (yalnız NEO'lar): listede, listeden çıkarılmış ya da hiç listelenmemiş
// Model bilgisiyle birleştirilip site/data/asteroids.json'a yazılır (depoya girer; site derlemesi ağa bağımlı değil).
// Yazmadan önce her kayıt doğrulanır (lib/jpl.js checkObject) ve önceki dosyayla karşılaştırılır: tutarsız ya da kuşkulu bir değişiklikte
// dosyaya dokunulmaz, betik hata verir. Değişiklik raporu --rapor <dosya> ile Markdown olarak yazılır (haftalık iş akışı PR gövdesine koyar).
// Kullanım (depo kökünden): node site/scripts/asteroitler.mjs [--rapor rapor.md]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapSbdb, mapCad, mapSentry, checkObject, compare, CAD_MAX_AU, CAD_RANGE } from '../lib/jpl.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KAT = path.join(ROOT, 'web/models/ast/katalog.json'), OUT = path.join(ROOT, 'site/data/asteroids.json');
const UA = { 'User-Agent': 'lookstar19/0.2 (non-commercial space library; +https://github.com/yazicmert/LS19)' };
const RAPOR = process.argv.includes('--rapor') ? process.argv[process.argv.indexOf('--rapor') + 1] : null;
const API = 'https://ssd-api.jpl.nasa.gov';

// katalogdaki Türkçe kaynak satırlarının İngilizcesi (model kaynakları: NASA PDS Küçük Cisimler Düğümü, NASA Eyes)
const EN = [[/ vd\./g, ' et al.'], [/Radar modeli/g, 'Radar shape model'], [/radar modeli/g, 'radar shape model'], [/Dawn SPC modeli/g, 'Dawn SPC shape model'],
  [/Rosetta OSIRIS modeli/g, 'Rosetta OSIRIS shape model'], [/\(geri yönlü\)/g, '(retrograde)'], [/\(ana gövde\)/g, '(primary body)'],
  [/radar \+ uyarlamalı optik şekli; yüzey dokusu temsilî/g, 'radar + adaptive-optics shape; surface texture illustrative']];
const en = (s) => EN.reduce((t, [a, b]) => t.replace(a, b), s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// JSON isteği: 20 sn zaman aşımı, 5xx ve ağ hatasında üç deneme; 4xx yanıtın gövdesi döner (Sentry "bulunamadı" bir 200 ya da 4xx olabilir)
const versions = {};
async function get(url) {
  for (let k = 1; ; k++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20_000) });
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j && j.signature) versions[j.signature.source] = j.signature.version;
      return j;
    } catch (e) {
      if (k >= 3) throw new Error(`${url}: ${e.message}`);
      await wait(2000 * k);
    }
  }
}

const kat = JSON.parse(fs.readFileSync(KAT, 'utf8')), out = [];
for (const [sstr, m] of Object.entries(kat)) {
  const d = await get(`${API}/sbdb.api?sstr=${encodeURIComponent(sstr)}&phys-par=1&full-prec=1`);
  if (!d || !d.object || !d.orbit) throw new Error(`SBDB ${sstr}: beklenmeyen yanıt ${JSON.stringify(d).slice(0, 160)}`);
  const s = mapSbdb(d);
  await wait(200);
  const cad = await get(`${API}/cad.api?des=${encodeURIComponent(s.des)}&date-min=${CAD_RANGE[0]}&date-max=${CAD_RANGE[1]}&dist-max=${CAD_MAX_AU}&body=Earth`);
  if (!cad || (cad.count == null && !cad.data)) throw new Error(`CAD ${s.des}: beklenmeyen yanıt`);
  let sentry = null;
  if (s.neo) { await wait(200); sentry = mapSentry(await get(`${API}/sentry.api?des=${encodeURIComponent(s.des)}`)); }
  out.push({
    id: m.key, sstr, ...s, approaches: mapCad(cad), sentry,
    model: { key: m.key, method: m.yontem === 'uzay' ? 'spacecraft' : 'radar', textured: !!m.tex, tris: m.tris, radiusKm: m.req_km, dims: m.dims.map((x) => +(x * m.req_km).toFixed(4)),
      source: { tr: m.kaynak, en: en(m.kaynak) } },
  });
  process.stdout.write('.');
  await wait(250);                                                          // JPL'e nazik: istekler arası kısa bekleme
}
out.sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || a.des.localeCompare(b.des));

const next = {
  retrieved: new Date().toISOString().slice(0, 10),
  source: 'JPL Small-Body Database API (ssd-api.jpl.nasa.gov/sbdb.api)',
  apis: versions,
  cad: { maxAu: CAD_MAX_AU, range: CAD_RANGE, body: 'Earth' },
  objects: out,
};
const errors = out.flatMap(checkObject);
if (out.length !== Object.keys(kat).length) errors.push(`katalogda ${Object.keys(kat).length} cisim, gelen ${out.length}`);
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
const { notes, stop } = compare(prev, next);
if (errors.length || stop.length) {
  console.error(`\nveri yazılmadı:\n${[...errors, ...stop].map((x) => `  - ${x}`).join('\n')}`);
  process.exit(1);
}
fs.writeFileSync(OUT, JSON.stringify(next, null, 1) + '\n');
const nCad = out.reduce((n, o) => n + o.approaches.length, 0), listed = out.filter((o) => o.sentry && o.sentry.status === 'listed').map((o) => o.name);
const summary = `${out.length} cisim; ${nCad} yakın geçiş (≤ ${CAD_MAX_AU} au, ${CAD_RANGE.join(' – ')}); Sentry listesinde: ${listed.join(', ') || 'yok'}.\n` +
  `API sürümleri: ${Object.entries(versions).map(([k, v]) => `${k} ${v}`).join('; ')}.`;
console.log(`\n${summary}\n→ ${path.relative(ROOT, OUT)}`);
if (RAPOR) fs.writeFileSync(RAPOR, `${summary}\n\n${notes.length ? `### Değişiklikler\n\n${notes.map((x) => `- ${x}`).join('\n')}` : 'Yörünge çözümlerinde, sınıf bayraklarında, belirsizlik kodlarında ve Sentry durumlarında değişiklik yok.'}\n`);
