// lookstar19 uydu verisi: LS19'da gerçek 3B modeli olan ve şu an yörüngede etkin uydular (web/js/satcatalog.js; temsilî ticari GEO
// platformu hariç). İki kamu kaynağı:
//   CelesTrak GP (OMM JSON, "active" grubu) — LS19'un 2 saatte bir güncellenen kopyasından (depo "data" dalı; .github/workflows/celestrak-data.yml)
//   GCAT, J. McDowell (planet4589.org, CC BY 4.0) — kütle, boyut, sahip, üretici, gövde; fırlatma tarihi, aracı ve yeri
// Her kayıt doğrulanır (lib/sat.js checkSat) ve önceki dosyayla karşılaştırılır; tutarsızlıkta dosyaya dokunulmaz, betik hata verir.
// Kullanım (depo kökünden): node site/scripts/uydular.mjs [--rapor rapor.md]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modelFor, MODELS, srcOf } from '../../web/js/satcatalog.js';
import { mapGp, mapGcat, parseTsv, indexBy, checkSat, compareSats } from '../lib/sat.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), OUT = path.join(ROOT, 'site/data/satellites.json');
const UA = { 'User-Agent': 'lookstar19/0.2 (non-commercial space library; +https://github.com/yazicmert/LS19)' };
const RAPOR = process.argv.includes('--rapor') ? process.argv[process.argv.indexOf('--rapor') + 1] : null;
const DATA = 'https://raw.githubusercontent.com/yazicmert/LS19/data', GCAT = 'https://planet4589.org/space/gcat/tsv';
const SKIP = new Set(['ssl1300']);
const pick = (row, k) => { const v = row && String(row[k] || '').trim(); return v && v !== '-' ? v : null; };                                          // temsilî model: uydunun kendisinin değil
// satcatalog.js başlıkları Türkçe; İngilizceleri (yalnız Türkçe sözcük içerenler)
// GCAT kaydının uydunun tamamını anlatmadığı durumlar: sayfada açıkça yazılır
const NOTES = {
  25544: { en: 'GCAT catalogues the station under its first module, Zarya (launched 1998); mass and dimensions below describe that module, not the assembled station.',
    tr: 'GCAT istasyonu ilk modülü Zarya (1998) adıyla kataloglar; aşağıdaki kütle ve boyutlar istasyonun tamamını değil o modülü anlatır.' },
};
const TITLE_EN = {
  iss: 'International Space Station', hubble: 'Hubble Space Telescope', chandra: 'Chandra X-ray Observatory', fermi: 'Fermi Gamma-ray Space Telescope',
  tdrs1: 'TDRS (first generation)', tdrs3: 'TDRS (third generation, K–M)', goes: 'GOES-R series', acs3: 'ACS3 solar sail',
  themis: 'THEMIS / ARTEMIS', swas: 'SWAS (Submillimeter Wave Astronomy Satellite)', jason: 'Jason-2 (OSTM)',
};

async function get(url, as = 'json') {
  for (let k = 1; ; k++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(180_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return as === 'json' ? await r.json() : await r.text();
    } catch (e) {
      if (k >= 3) throw new Error(`${url}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 3000 * k));
    }
  }
}

const [gp, meta, satcatTxt, launchTxt, orgsTxt, sitesTxt, psatTxt] = await Promise.all([
  get(`${DATA}/gp_active.json`), get(`${DATA}/meta.json`),
  get(`${GCAT}/cat/satcat.tsv`, 'text'), get(`${GCAT}/launch/launch.tsv`, 'text'), get(`${GCAT}/tables/orgs.tsv`, 'text'), get(`${GCAT}/tables/sites.tsv`, 'text'), get(`${GCAT}/cat/psatcat.tsv`, 'text'),
]);
if (!Array.isArray(gp) || gp.length < 5000) throw new Error(`GP verisi beklenmeyen: ${Array.isArray(gp) ? gp.length : typeof gp} kayıt`);
const gcatUpdated = (/# Updated (\d{4} \w{3} +\d{1,2})/.exec(satcatTxt) || [])[1] || null;
const satcat = indexBy(parseTsv(satcatTxt), 'Satcat'), psat = indexBy(parseTsv(psatTxt), 'JCAT');
const tables = { launches: indexBy(parseTsv(launchTxt), 'Launch_Tag'), orgs: indexBy(parseTsv(orgsTxt), 'Code'), sites: indexBy(parseTsv(sitesTxt), 'Site') };
if (satcat.size < 50000 || tables.launches.size < 5000) throw new Error('GCAT tabloları eksik');

// seçim: modeli olan uydular; aynı modeli paylaşanlar (kardeş uydular) ayrı kayıt, model notuyla
const picked = [];
for (const g of gp) {
  const m = modelFor(g.NORAD_CAT_ID, g.OBJECT_NAME);
  if (m && !SKIP.has(m.key) && MODELS[m.key]) picked.push([g, m]);
}
const shared = picked.reduce((c, [, m]) => c.set(m.key, (c.get(m.key) || 0) + 1), new Map());
const retrieved = new Date().toISOString().slice(0, 10);
const objects = picked.map(([g, m]) => {
  const o = mapGp(g), gc = mapGcat(satcat.get(String(o.norad)), tables);
  const own = shared.get(m.key) === 1 && !m.note;                            // model bu uydunun kendisi (kardeşi ya da temsilî notu yok)
  const tr = MODELS[m.key].title, en = TITLE_EN[m.key] || tr;
  const gname = gc && (gc.name || gc.plName);
  return {
    id: String(o.norad), ...o,
    title: own ? { en, tr } : { en: gname || o.name, tr: gname || o.name },
    gcat: gc ? { ...gc, program: pick(psat.get(gc.jcat), 'Program'), category: pick(psat.get(gc.jcat), 'Category'), comment: pick(psat.get(gc.jcat), 'Comment') } : null, note: NOTES[o.norad] || null,
    model: { key: m.key, title: { en, tr }, size: MODELS[m.key].size, source: srcOf(MODELS[m.key]), own },
  };
}).sort((a, b) => a.title.en.localeCompare(b.title.en, 'en') || a.norad - b.norad);

const next = {
  retrieved, gp: { source: 'CelesTrak GP (OMM), group "active"', copied: meta && meta.t ? new Date(meta.t).toISOString() : null },
  gcat: { source: 'GCAT, J. McDowell, planet4589.org (CC BY 4.0)', updated: gcatUpdated }, objects,
};
const errors = objects.flatMap((s) => checkSat(s, retrieved));
if (objects.length < 30) errors.push(`yalnız ${objects.length} uydu eşleşti`);
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
const { notes, stop } = compareSats(prev, next);
if (errors.length || stop.length) { console.error(`veri yazılmadı:\n${[...errors, ...stop].map((x) => `  - ${x}`).join('\n')}`); process.exit(1); }
fs.writeFileSync(OUT, JSON.stringify(next, null, 1) + '\n');
const byReg = objects.reduce((c, o) => ((c[o.derived.regime] = (c[o.derived.regime] || 0) + 1), c), {});
const summary = `${objects.length} uydu (${Object.entries(byReg).map(([k, v]) => `${k} ${v}`).join(', ')}); GP kopyası ${next.gp.copied}; GCAT ${gcatUpdated}.`;
console.log(`${summary}\n→ ${path.relative(ROOT, OUT)}`);
if (RAPOR) fs.writeFileSync(RAPOR, `${summary}\n\n${notes.length ? `### Uydu değişiklikleri\n\n${notes.map((x) => `- ${x}`).join('\n')}` : 'Uydu listesinde ve yüksekliklerde kayda değer değişiklik yok.'}\n`);
